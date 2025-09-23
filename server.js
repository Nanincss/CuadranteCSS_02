const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer'); // Importar multer

require('dotenv').config(); // Para cargar variables de entorno desde un archivo .env

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permitir cualquier origen para desarrollo, ajustar en producción
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cuadrante_planificador_v3';

// --- Middlewares ---
app.use(cors());
app.use(express.json()); // Para parsear cuerpos de solicitud JSON
app.use(express.static('public')); // Servir archivos estáticos desde la carpeta 'public'
app.use('/uploads', express.static('uploads')); // Servir archivos estáticos desde la carpeta 'uploads'

// --- Configuración de Multer para subida de archivos ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Directorio donde se guardarán los archivos
    },
    filename: function (req, file, cb) {
        // Generar un nombre de archivo único
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
    }
});
const upload = multer({ storage: storage });

// --- Conexión a MongoDB ---
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Conectado a MongoDB');
        // Crear un usuario admin por defecto si no existe ninguno
        createDefaultAdmin(); 
    })
    .catch(err => console.error('Error de conexión a MongoDB:', err));

async function createDefaultAdmin() {
    try {
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            const defaultAdmin = new User({
                name: 'Gustavo',
                identifier: '3434',
                role: 'admin'
            });
            await defaultAdmin.save();
            console.log('Creado el usuario administrador por defecto (admin/admin).');
        }
    } catch (err) {
        console.error("Error al crear el usuario admin por defecto:", err);
    }
}

// --- Modelos de Mongoose ---
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    identifier: { type: String, required: true, unique: true },
    role: {
        type: String,
        required: true,
        enum: ['admin', 'editor', 'viewer'], // todo, parte, nada
        default: 'viewer'
    }
});
const User = mongoose.model('User', userSchema);

const calendarEntrySchema = new mongoose.Schema({
    dateKey: { type: String, required: true, unique: true }, // e.g., "2025-09-18"
    name: String,
    address: String,
    phone: String,
    editor: String,
    imageUrls: [String], // Nuevo campo para almacenar URLs de imágenes
});
const CalendarEntry = mongoose.model('CalendarEntry', calendarEntrySchema);

const changeLogSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    user: { type: String, required: true },
    action: { type: String, required: true, enum: ['create', 'update', 'delete'] },
    entryDateKey: { type: String, required: true },
    previousData: { type: Object },
    newData: { type: Object }
});
const ChangeLog = mongoose.model('ChangeLog', changeLogSchema);


// --- Rutas API ---

// Ruta de Login
app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ identifier: req.body.identifier });
        if (user == null) {
            return res.status(404).json({ message: 'Identificador no encontrado' });
        }
        res.json(user);
    } catch (err) {
        console.error('Error en la ruta /api/login:', err);
        res.status(500).json({ message: err.message });
    }
});

// Rutas para usuarios
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    // TODO: Añadir aquí la lógica para que solo un admin pueda crear usuarios
    const user = new User({
        name: req.body.name,
        identifier: req.body.identifier,
        role: req.body.role
    });
    try {
        const newUser = await user.save();
        io.emit('userAdded', newUser); // Notificar a los clientes
        res.status(201).json(newUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    // TODO: Añadir aquí la lógica para que solo un admin pueda eliminar usuarios
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (user == null) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        io.emit('userDeleted', user._id); // Notificar a los clientes con el ID
        res.json({ message: 'Usuario eliminado' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rutas para entradas del calendario
app.get('/api/calendar/:year/:month', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        // Formatear las fechas para que coincidan con el formato de dateKey "YYYY-MM-DD"
        const startKey = `${year}-${String(month).padStart(2, '0')}-01`;
        const endKey = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;

        const entries = await CalendarEntry.find({
            dateKey: { $gte: startKey, $lte: endKey }
        });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/calendar/:dateKey', async (req, res) => {
    try {
        const entry = await CalendarEntry.findOne({ dateKey: req.params.dateKey });
        if (entry == null) {
            return res.status(404).json({ message: 'Entrada no encontrada' });
        }
        res.json(entry);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/calendar', async (req, res) => {
    const entry = new CalendarEntry(req.body);
    try {
        const newEntry = await entry.save();
        const log = new ChangeLog({
            user: req.body.editor,
            action: 'create',
            entryDateKey: req.body.dateKey,
            newData: newEntry
        });
        await log.save();
        io.emit('calendarEntryUpdated', newEntry); // Notificar a los clientes
        res.status(201).json(newEntry);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.put('/api/calendar/:dateKey', async (req, res) => {
    try {
        const oldEntry = await CalendarEntry.findOne({ dateKey: req.params.dateKey });
        const updatedEntry = await CalendarEntry.findOneAndUpdate(
            { dateKey: req.params.dateKey },
            req.body,
            { new: true, upsert: true } // Crea si no existe, devuelve el nuevo documento
        );
        const log = new ChangeLog({
            user: req.body.editor,
            action: 'update',
            entryDateKey: req.params.dateKey,
            previousData: oldEntry,
            newData: updatedEntry
        });
        await log.save();
        io.emit('calendarEntryUpdated', updatedEntry); // Notificar a los clientes
        res.json(updatedEntry);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.delete('/api/calendar/:dateKey', async (req, res) => {
    try {
        const entry = await CalendarEntry.findOneAndDelete({ dateKey: req.params.dateKey });
        if (entry == null) {
            return res.status(404).json({ message: 'Entrada no encontrada' });
        }
        const log = new ChangeLog({
            user: 'unknown', // No hay un usuario en la petición de borrado
            action: 'delete',
            entryDateKey: req.params.dateKey,
            previousData: entry
        });
        await log.save();
        io.emit('calendarEntryDeleted', req.params.dateKey); // Notificar a los clientes
        res.json({ message: 'Entrada eliminada' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/logs/:year/:month', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const logs = await ChangeLog.find({
            date: { $gte: startDate, $lte: endDate }
        }).sort({ date: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Ruta para subir imágenes
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No se ha subido ningún archivo.');
    }
    // La URL de la imagen será /uploads/nombre_del_archivo
    const imageUrl = `/uploads/${req.file.filename}`;
    res.status(200).json({ imageUrl: imageUrl });
});


// --- Socket.IO (placeholders para eventos de tiempo real) ---
io.on('connection', (socket) => {
    console.log('Nuevo cliente conectado:', socket.id);

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });

    // Aquí puedes añadir más eventos para la comunicación en tiempo real
    // Por ejemplo, para notificar cambios específicos o para chat
});


// --- Iniciar el servidor ---
server.listen(PORT, () => {
    console.log(`Servidor backend escuchando en el puerto ${PORT}`);
});
