document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIGURACIÓN INICIAL ---
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const MAX_YEAR = 2030;
    const API_URL = ''; // URL del backend ES RELATIVA

    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    const userGreeting = document.getElementById('user-greeting');
    const manageUsersBtn = document.getElementById('manage-users-btn');
    const reportBtn = document.getElementById('report-btn');
    const calendarTable = document.getElementById('calendar');
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const printTitle = document.getElementById('print-title');

    // --- Login Modal ---
    const loginModal = document.getElementById('login-modal');
    const loginIdentifierInput = document.getElementById('login-identifier');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');

    // --- User Management Modal ---
    const userModal = document.getElementById('user-modal');
    const userList = document.getElementById('user-list');
    const newUserNameInput = document.getElementById('new-user-name');
    const newUserIdentifierInput = document.getElementById('new-user-identifier');
    const newUserRoleSelect = document.getElementById('new-user-role');
    const addUserBtn = document.getElementById('add-user-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');

    // --- Report Modal ---
    const reportModal = document.getElementById('report-modal');
    const reportContent = document.getElementById('report-content');
    const closeReportModalBtn = document.getElementById('close-report-modal-btn');
    const imageUploadInput = document.getElementById('image-upload-input');

    // --- ESTADO DE LA APLICACIÓN ---
    let loggedInUser = null;
    let users = [];
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let monthData = {};
    const socket = io(API_URL);

    // --- LÓGICA DE LOGIN ---

    async function handleLogin() {
        console.log('handleLogin called');
        const identifier = loginIdentifierInput.value.trim();
        if (!identifier) {
            showLoginError('El identificador no puede estar vacío.');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Identificador no encontrado.');
                }
                throw new Error('Error en el servidor.');
            }

            loggedInUser = await response.json();
            loginModal.style.display = 'none';
            mainAppInit(); // Iniciar la aplicación principal

        } catch (error) {
            showLoginError(error.message);
        }
    }

    function showLoginError(message) {
        loginError.textContent = message;
        loginError.style.display = 'block';
    }

    loginBtn.addEventListener('click', handleLogin);
    loginIdentifierInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // --- FUNCIONES DE DATOS (API) ---

    async function loadUsers() {
        try {
            const response = await fetch(`${API_URL}/api/users`);
            users = await response.json();
        } catch (error) {
            console.error('Error al cargar usuarios:', error);
        }
    }

    async function addUser(userData) {
        try {
            const response = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            if (!response.ok) throw new Error('No se pudo crear el usuario.');
        } catch (error) {
            console.error('Error al añadir usuario:', error);
            alert(error.message);
        }
    }

    async function deleteUser(userId) {
        try {
            const response = await fetch(`${API_URL}/api/users/${userId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('No se pudo eliminar el usuario.');
        } catch (error) {
            console.error('Error al eliminar usuario:', error);
            alert(error.message);
        }
    }

    async function loadData(year, month) {
        try {
            const response = await fetch(`${API_URL}/api/calendar/${year}/${month + 1}`);
            const entries = await response.json();
            monthData = entries.reduce((acc, entry) => {
                acc[entry.dateKey] = entry;
                return acc;
            }, {});
            return monthData;
        } catch (error) {
            console.error('Error al cargar datos del calendario:', error);
            return {};
        }
    }

    async function saveData(dateKey, data) {
        try {
            await fetch(`${API_URL}/api/calendar/${dateKey}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error('Error al guardar datos:', error);
        }
    }

    // --- RENDERIZADO Y LÓGICA DE UI ---

    function applyPermissions() {
        if (loggedInUser.role !== 'admin') {
            manageUsersBtn.style.display = 'none';
            reportBtn.style.display = 'none';
        }
    }

    function renderUserList() {
        userList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>
                    <strong>${user.name}</strong> (${user.identifier}) - <em>${user.role}</em>
                </span>
            `;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'X';
            deleteBtn.className = 'delete-user-btn';
            deleteBtn.onclick = () => {
                if (confirm(`¿Seguro que quieres eliminar a ${user.name}?`)) {
                    deleteUser(user._id);
                }
            };

            if (loggedInUser._id !== user._id) {
                li.appendChild(deleteBtn);
            }

            userList.appendChild(li);
        });
    }

    async function renderCalendar(year, month) {
        console.log(`renderCalendar called for ${monthNames[month]} ${year}`);
        printTitle.textContent = `${monthNames[month]} de ${year}`;
        calendarTable.innerHTML = '';
        await loadData(year, month);

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        weekDays.forEach(day => {
            const th = document.createElement('th');
            th.textContent = day;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        calendarTable.appendChild(thead);

        const tbody = document.createElement('tbody');
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let dayCounter = 1;
        let dayOfWeek = firstDayOfMonth.getDay();
        if (dayOfWeek === 0) dayOfWeek = 7;
        const startingBlanks = dayOfWeek - 1;
        let weekRow = document.createElement('tr');

        for (let i = 0; i < startingBlanks; i++) {
            weekRow.appendChild(document.createElement('td')).classList.add('other-month');
        }

        while (dayCounter <= daysInMonth) {
            const currentDate = new Date(year, month, dayCounter);
            const currentDayOfWeek = currentDate.getDay();

            if (currentDayOfWeek !== 0 && currentDayOfWeek !== 6) {
                if (weekRow.children.length === 5) {
                    tbody.appendChild(weekRow);
                    weekRow = document.createElement('tr');
                }

                const cell = document.createElement('td');
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCounter).padStart(2, '0')}`;
                cell.dataset.date = dateKey;

                const dayData = monthData[dateKey] || { name: '', address: '', phone: '', imageUrls: [] };
                const editorText = dayData.editor ? `Mod. por: ${dayData.editor}` : '';

                const today = new Date();
                if (currentDate.toDateString() === today.toDateString()) {
                    cell.classList.add('today');
                }

                const dayNumberDiv = document.createElement('div');
                dayNumberDiv.className = 'day-number';
                dayNumberDiv.textContent = dayCounter;

                const createContentDiv = (field, placeholder, value) => {
                    const div = document.createElement('div');
                    div.className = 'cell-content';
                    div.dataset.field = field;
                    div.dataset.placeholder = placeholder;
                    div.contentEditable = loggedInUser.role !== 'viewer';
                    div.textContent = value || '';
                    return div;
                };

                const editorInfoDiv = document.createElement('div');
                editorInfoDiv.className = 'editor-info';
                editorInfoDiv.textContent = editorText;

                const imageContainer = document.createElement('div');
                imageContainer.className = 'image-container';
                imageContainer.dataset.date = dateKey; // Para identificar a qué día pertenece

                // Renderizar imágenes existentes
                if (dayData.imageUrls && dayData.imageUrls.length > 0) {
                    dayData.imageUrls.forEach(url => {
                        const imgWrapper = document.createElement('div');
                        imgWrapper.className = 'image-wrapper';
                        const img = document.createElement('img');
                        img.src = url;
                        img.className = 'image-preview';
                        const deleteImgBtn = document.createElement('button');
                        deleteImgBtn.className = 'delete-image-btn';
                        deleteImgBtn.textContent = 'X';
                        deleteImgBtn.onclick = (e) => {
                            e.stopPropagation(); // Evitar que el click se propague a la celda
                            deleteImage(dateKey, url);
                        };
                        imgWrapper.append(img, deleteImgBtn);
                        imageContainer.appendChild(imgWrapper);
                    });
                }

                const uploadImageBtn = document.createElement('button');
                uploadImageBtn.className = 'upload-image-btn';
                uploadImageBtn.textContent = 'Subir Imagen';
                uploadImageBtn.onclick = (e) => {
                    e.stopPropagation(); // Evitar que el click se propague a la celda
                    if (loggedInUser.role !== 'viewer') {
                        imageUploadInput.dataset.date = dateKey; // Guardar la fecha en el input
                        imageUploadInput.click(); // Abrir el selector de archivos
                    } else {
                        alert('No tienes permiso para subir imágenes.');
                    }
                };

                cell.append(dayNumberDiv,
                    createContentDiv('name', 'Nombre...', dayData.name),
                    createContentDiv('address', 'Dirección...', dayData.address),
                    createContentDiv('phone', 'Teléfono...', dayData.phone),
                    editorInfoDiv,
                    imageContainer,
                    uploadImageBtn);

                weekRow.appendChild(cell);
            }

            if (currentDayOfWeek === 5 || dayCounter === daysInMonth) {
                while (weekRow.children.length > 0 && weekRow.children.length < 5) {
                    weekRow.appendChild(document.createElement('td')).classList.add('other-month');
                }
                tbody.appendChild(weekRow);
                weekRow = document.createElement('tr');
            }
            dayCounter++;
        }

        calendarTable.appendChild(tbody);
    }

    async function showReport(year, month) {
        try {
            const response = await fetch(`${API_URL}/api/logs/${year}/${month + 1}`);
            const logs = await response.json();

            if (logs.length === 0) {
                reportContent.innerHTML = '<p>No hay cambios para este mes.</p>';
                return;
            }

            let reportHTML = '<ul>';
            for (const log of logs) {
                const logDate = new Date(log.date).toLocaleString('es-ES');
                let changes = '';

                if (log.action === 'create') {
                    changes = `Se creó una nueva entrada para el ${log.entryDateKey}.`;
                } else if (log.action === 'delete') {
                    changes = `Se eliminó la entrada del ${log.entryDateKey}.`;
                } else if (log.action === 'update') {
                    changes = `Se actualizó la entrada del ${log.entryDateKey}.<br>`;
                    for (const key in log.newData) {
                        if (key !== '_id' && key !== '__v' && log.newData[key] !== log.previousData[key]) {
                            changes += `&nbsp;&nbsp;- ${key}: de "${log.previousData[key]}" a "${log.newData[key]}"<br>`;
                        }
                    }
                }

                reportHTML += `<li><strong>${logDate}</strong> - Usuario: ${log.user} - Acción: ${log.action}<br>${changes}</li>`;
            }
            reportHTML += '</ul>';

            reportContent.innerHTML = reportHTML;
        } catch (error) {
            console.error('Error al cargar el informe:', error);
            reportContent.innerHTML = '<p>Error al cargar el informe.</p>';
        }
    }

    // --- INICIALIZACIÓN DE LA APP PRINCIPAL ---

    async function mainAppInit() {
        console.log('mainAppInit called');
        document.getElementById('main-container').style.display = 'block';
        userGreeting.textContent = `Hola, ${loggedInUser.name}`;

        applyPermissions();
        await loadUsers();

        const startYear = new Date().getFullYear();
        for (let y = startYear; y <= MAX_YEAR; y++) {
            const option = document.createElement('option');
            option.value = y;
            option.textContent = y;
            yearSelect.appendChild(option);
        }

        monthSelect.value = currentMonth;
        yearSelect.value = currentYear;

        monthSelect.addEventListener('change', (e) => {
            currentMonth = parseInt(e.target.value, 10);
            renderCalendar(currentYear, currentMonth);
        });

        yearSelect.addEventListener('change', (e) => {
            currentYear = parseInt(e.target.value, 10);
            renderCalendar(currentYear, currentMonth);
        });

        manageUsersBtn.addEventListener('click', () => {
            renderUserList();
            userModal.style.display = 'flex';
        });

        closeModalBtn.addEventListener('click', () => {
            userModal.style.display = 'none';
        });

        reportBtn.addEventListener('click', async () => {
            await showReport(currentYear, currentMonth);
            reportModal.style.display = 'flex';
        });

        closeReportModalBtn.addEventListener('click', () => {
            reportModal.style.display = 'none';
        });

        addUserBtn.addEventListener('click', () => {
            const userData = {
                name: newUserNameInput.value.trim(),
                identifier: newUserIdentifierInput.value.trim(),
                role: newUserRoleSelect.value
            };
            if (userData.name && userData.identifier) {
                addUser(userData);
                newUserNameInput.value = '';
                newUserIdentifierInput.value = '';
            } else {
                alert('El nombre y el identificador son obligatorios.');
            }
        });
        
        calendarTable.addEventListener('blur', (event) => {
            const target = event.target;
            if (loggedInUser.role === 'viewer') return;

            if (target.classList.contains('cell-content')) {
                const cell = target.closest('td');
                if (!cell) return;

                const dateKey = cell.dataset.date;
                const field = target.dataset.field;
                if (!dateKey || !field) return;

                const dayData = monthData[dateKey] || { dateKey, name: '', address: '', phone: '', imageUrls: [] };
                dayData[field] = target.textContent;
                dayData.editor = loggedInUser.name;
                
                saveData(dateKey, dayData);
            }
        }, true);

        // --- Lógica de subida de imágenes ---
        imageUploadInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            const dateKey = imageUploadInput.dataset.date;
            if (!file || !dateKey) return;

            const formData = new FormData();
            formData.append('image', file);

            try {
                const response = await fetch(`${API_URL}/api/upload`, {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) throw new Error('Error al subir la imagen.');
                const result = await response.json();
                const imageUrl = result.imageUrl;

                // Actualizar monthData y guardar en la base de datos
                const dayData = monthData[dateKey] || { dateKey, name: '', address: '', phone: '', imageUrls: [] };
                if (!dayData.imageUrls) dayData.imageUrls = [];
                dayData.imageUrls.push(imageUrl);
                dayData.editor = loggedInUser.name;
                await saveData(dateKey, dayData);

                // Limpiar el input para permitir la misma imagen de nuevo
                event.target.value = '';

            } catch (error) {
                console.error('Error en la subida de imagen:', error);
                alert('Error al subir la imagen: ' + error.message);
            }
        });

        renderCalendar(currentYear, currentMonth);
    }

    async function deleteImage(dateKey, imageUrlToDelete) {
        if (loggedInUser.role === 'viewer') {
            alert('No tienes permiso para eliminar imágenes.');
            return;
        }
        if (!confirm('¿Estás seguro de que quieres eliminar esta imagen?')) return;

        try {
            const dayData = monthData[dateKey];
            if (!dayData || !dayData.imageUrls) return;

            dayData.imageUrls = dayData.imageUrls.filter(url => url !== imageUrlToDelete);
            dayData.editor = loggedInUser.name;
            await saveData(dateKey, dayData);

        } catch (error) {
            console.error('Error al eliminar imagen:', error);
            alert('Error al eliminar la imagen: ' + error.message);
        }
    }

    // --- SOCKET.IO LISTENERS ---
    socket.on('connect', () => {
        console.log('Conectado al servidor de Socket.IO');
    });

    socket.on('userAdded', (newUser) => {
        users.push(newUser);
        if (userModal.style.display === 'flex') {
            renderUserList();
        }
    });

    socket.on('userDeleted', (deletedUserId) => {
        users = users.filter(user => user._id !== deletedUserId);
        if (userModal.style.display === 'flex') {
            renderUserList();
        }
    });

    socket.on('calendarEntryUpdated', (updatedEntry) => {
        const entryDate = new Date(updatedEntry.dateKey);
        if (entryDate.getFullYear() === currentYear && entryDate.getMonth() === currentMonth) {
            monthData[updatedEntry.dateKey] = updatedEntry;
            renderCalendar(currentYear, currentMonth);
        }
    });
    
    socket.on('calendarEntryDeleted', (deletedDateKey) => {
        const entryDate = new Date(deletedDateKey);
        if (entryDate.getFullYear() === currentYear && entryDate.getMonth() === currentMonth) {
            delete monthData[deletedDateKey];
            renderCalendar(currentYear, currentMonth);
        }
    });

});
