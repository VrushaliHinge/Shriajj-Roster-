// Staff Roster Management System - Main Application JavaScript
// Converted from React to Vanilla JavaScript while maintaining all functionality

// Application State Management
let appState = {
    // Authentication
    isLoggedIn: false,
    currentUser: '',
    
    // UI State
    activeTab: 'roster',
    editMode: false,
    currentWeekStart: new Date(2025, 7, 3), // Aug 3, 2025
    showPassword: false,
    rememberPassword: false,
    
    // Network State
    isOnline: navigator.onLine,
    syncStatus: 'synced', // 'synced', 'syncing', 'offline'
    
    // Configuration
    appConfig: {
        companyName: "Shriajj Pty Ltd",
        systemTitle: "Staff Roster Management System",
        locationId: "main",
        timezone: "Australia/Melbourne",
        developer: "Vrushali Hinge",
        users: {
            admin: 'shriajj2025',
            manager: 'manager123',
            supervisor: 'super2025'
        }
    },
    
    // Data
    employees: ['Bhanush', 'Girish', 'Aravind', 'Vansh', 'Kashish', 'Sonam', 'Tejal', 'Anshul', 'Matt', 'Aswin'],
    locations: ['Caroline Springs', 'Werribee Plaza', 'Point Cook', 'Geelong', 'Woodgrove'],
    allRosterData: {},
    publicHolidays: {},
    
    // Modal state
    currentEditingShift: null,
    currentEditingEmployee: null,
    currentEditingLocation: null
};

// Database Configuration
const DATABASE_CONFIG = {
    supabase: {
        url: process.env.SUPABASE_URL || 'https://uuorqbugdhfoikylbxdz.supabase.co',
        key: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1b3JxYnVnZGhmb2lreWxieGR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MzQ4NDcsImV4cCI6MjA3MDAxMDg0N30.-d7xjLnyFVoVKbruKhVJthHYCFUkkrWlwijDbrKdye4',
        enabled: true
    }
};

// Enhanced Database Service with Supabase Integration
class DatabaseService {
    constructor() {
        this.isConnected = false;
        this.listeners = new Set();
        this.localCache = JSON.parse(localStorage.getItem('roster-cache') || '{}');
        this.supabase = null;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    // Initialize Supabase connection
    async initialize(config) {
        try {
            if (config.supabase?.enabled && window.supabase) {
                this.supabase = window.supabase.createClient(
                    config.supabase.url,
                    config.supabase.key
                );
                
                // Test connection
                const { data, error } = await this.supabase
                    .from('rosters')
                    .select('count', { count: 'exact', head: true });
                
                if (!error || error.code === 'PGRST116') { // Table doesn't exist is OK
                    this.isConnected = true;
                    console.log('✅ Supabase connected successfully!');
                    await this.initializeTables();
                    this.setupRealtimeSubscriptions();
                    return true;
                } else {
                    throw error;
                }
            }
            return false;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            this.isConnected = false;
            return false;
        }
    }

    // Initialize required database tables
    async initializeTables() {
        const tables = [
            {
                name: 'rosters',
                schema: `
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    location_id TEXT NOT NULL,
                    week_key TEXT NOT NULL,
                    data JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(location_id, week_key)
                `
            },
            {
                name: 'employees',
                schema: `
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    location_id TEXT NOT NULL,
                    employees JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(location_id)
                `
            },
            {
                name: 'locations',
                schema: `
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    location_id TEXT NOT NULL,
                    locations JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(location_id)
                `
            }
        ];

        for (const table of tables) {
            try {
                const { data, error } = await this.supabase
                    .from(table.name)
                    .select('count', { count: 'exact', head: true });
                
                if (error && error.code === 'PGRST116') {
                    console.log(`⚠️ Table '${table.name}' doesn't exist. Please create it in Supabase dashboard.`);
                    console.log(`Schema: CREATE TABLE ${table.name} (${table.schema});`);
                }
            } catch (error) {
                console.warn(`Could not verify table ${table.name}:`, error);
            }
        }
    }

    // Setup real-time subscriptions
    setupRealtimeSubscriptions() {
        if (!this.supabase) return;

        // Subscribe to roster changes
        this.supabase
            .channel('rosters-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'rosters'
            }, (payload) => {
                this.notifyListeners({
                    type: 'roster_updated',
                    payload
                });
            })
            .subscribe();

        // Subscribe to employee changes
        this.supabase
            .channel('employees-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'employees'
            }, (payload) => {
                this.notifyListeners({
                    type: 'employees_updated',
                    payload
                });
            })
            .subscribe();
    }

    // Real-time data operations
    async saveRosterData(locationId, weekKey, data) {
        try {
            if (this.isConnected && this.supabase) {
                const { error } = await this.supabase
                    .from('rosters')
                    .upsert({
                        location_id: locationId,
                        week_key: weekKey,
                        data: data,
                        updated_at: new Date().toISOString()
                    });
                
                if (!error) {
                    console.log('✅ Roster data saved to Supabase');
                } else {
                    throw error;
                }
            }
            
            // Always save to local cache as backup
            this.localCache[`${locationId}-${weekKey}`] = data;
            localStorage.setItem('roster-cache', JSON.stringify(this.localCache));
            
            // Notify listeners of changes
            this.notifyListeners({ type: 'roster_updated', locationId, weekKey, data });
            return true;
        } catch (error) {
            console.error('❌ Failed to save roster data:', error);
            // Still save to local cache on failure
            this.localCache[`${locationId}-${weekKey}`] = data;
            localStorage.setItem('roster-cache', JSON.stringify(this.localCache));
            return false;
        }
    }

    async getRosterData(locationId, weekKey) {
        try {
            if (this.isConnected && this.supabase) {
                const { data, error } = await this.supabase
                    .from('rosters')
                    .select('data')
                    .eq('location_id', locationId)
                    .eq('week_key', weekKey)
                    .single();
                
                if (!error && data) {
                    console.log('✅ Roster data loaded from Supabase');
                    return data.data;
                }
            }
            
            // Fallback to local cache
            const cached = this.localCache[`${locationId}-${weekKey}`];
            if (cached) {
                console.log('📱 Using cached roster data');
            }
            return cached || null;
        } catch (error) {
            console.error('❌ Failed to fetch roster data:', error);
            return this.localCache[`${locationId}-${weekKey}`] || null;
        }
    }

    async saveEmployees(locationId, employees) {
        try {
            if (this.isConnected && this.supabase) {
                const { error } = await this.supabase
                    .from('employees')
                    .upsert({
                        location_id: locationId,
                        employees: employees,
                        updated_at: new Date().toISOString()
                    });
                
                if (!error) {
                    console.log('✅ Employees saved to Supabase');
                } else {
                    throw error;
                }
            }
            
            this.localCache[`${locationId}-employees`] = employees;
            localStorage.setItem('roster-cache', JSON.stringify(this.localCache));
            this.notifyListeners({ type: 'employees_updated', locationId, employees });
            return true;
        } catch (error) {
            console.error('❌ Failed to save employees:', error);
            this.localCache[`${locationId}-employees`] = employees;
            localStorage.setItem('roster-cache', JSON.stringify(this.localCache));
            return false;
        }
    }

    async getEmployees(locationId) {
        try {
            if (this.isConnected && this.supabase) {
                const { data, error } = await this.supabase
                    .from('employees')
                    .select('employees')
                    .eq('location_id', locationId)
                    .single();
                
                if (!error && data) {
                    console.log('✅ Employees loaded from Supabase');
                    return data.employees;
                }
            }
            
            const cached = this.localCache[`${locationId}-employees`];
            if (cached) {
                console.log('📱 Using cached employees');
            }
            return cached || null;
        } catch (error) {
            console.error('❌ Failed to fetch employees:', error);
            return this.localCache[`${locationId}-employees`] || null;
        }
    }

    // Real-time listeners for live updates
    onDataChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(change) {
        this.listeners.forEach(callback => callback(change));
    }

    // Connection status
    getConnectionStatus() {
        return this.isConnected;
    }

    // Manual sync for offline changes
    async syncOfflineChanges() {
        if (!this.isConnected) return false;
        
        try {
            console.log('🔄 Syncing offline changes...');
            // Implementation for syncing offline changes
            return true;
        } catch (error) {
            console.error('❌ Failed to sync offline changes:', error);
            return false;
        }
    }
}

// Initialize database service
const dbService = new DatabaseService();

// Utility Functions
function getCurrentWeekDates() {
    const days = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(appState.currentWeekStart);
        date.setDate(appState.currentWeekStart.getDate() + i);
        const dayName = dayNames[date.getDay()];
        const day = date.getDate();
        const month = monthNames[date.getMonth()];
        days.push(`${dayName} ${day}-${month}`);
    }
    return days;
}

function getCurrentWeekString() {
    const startDate = new Date(appState.currentWeekStart);
    const endDate = new Date(appState.currentWeekStart);
    endDate.setDate(startDate.getDate() + 6);
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startStr = `${startDate.getDate()}-${monthNames[startDate.getMonth()]}`;
    const endStr = `${endDate.getDate()}-${monthNames[endDate.getMonth()]}`;
    
    return `${startStr} to ${endStr}`;
}

function getCurrentWeekKey() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[appState.currentWeekStart.getMonth()];
    const date = appState.currentWeekStart.getDate();
    const year = appState.currentWeekStart.getFullYear();
    return `${month}-${date}-${year}`;
}

function getDefaultShift() {
    return {
        employee: '', 
        scheduledStart: '09:00', 
        scheduledEnd: '17:00',
        actualStart: '',
        actualEnd: '',
        leaveType: '',
        leaveHours: 0,
        notes: ''
    };
}

function calculateHours(scheduledStart, scheduledEnd, actualStart, actualEnd, day, leaveType, leaveHours = 0, isPublicHoliday = false) {
    // Handle pure leave days (no work)
    if (leaveType && (!actualStart && !actualEnd)) {
        return { 
            total: 0, 
            regular: 0, 
            overtime: 0, 
            publicHoliday: 0,
            annualLeave: leaveType === 'annual' ? (leaveHours || 8) : 0,
            sickLeave: leaveType === 'sick' ? (leaveHours || 8) : 0,
            publicHolidayLeave: leaveType === 'public' ? (leaveHours || 8) : 0
        };
    }
    
    const startTime = actualStart || scheduledStart;
    const endTime = actualEnd || scheduledEnd;
    
    if (!startTime || !endTime) {
        return { 
            total: 0, 
            regular: 0, 
            overtime: 0, 
            publicHoliday: 0,
            annualLeave: 0,
            sickLeave: 0,
            publicHolidayLeave: 0
        };
    }
    
    const start = new Date(`2024-01-01 ${startTime}`);
    const end = new Date(`2024-01-01 ${endTime}`);
    let totalHours = (end - start) / (1000 * 60 * 60);
    
    if (totalHours <= 0) {
        return { 
            total: 0, 
            regular: 0, 
            overtime: 0, 
            publicHoliday: 0,
            annualLeave: 0,
            sickLeave: 0,
            publicHolidayLeave: 0
        };
    }
    
    // Deduct break time for shifts > 4 hours
    let workingHours = totalHours > 4 ? totalHours - 0.5 : totalHours;
    
    // Initialize leave hours
    let annualLeaveHours = 0;
    let sickLeaveHours = 0;
    let publicHolidayLeaveHours = 0;
    
    // Handle mixed work + leave scenarios
    if (leaveType && leaveHours > 0) {
        if (leaveType === 'annual') {
            annualLeaveHours = leaveHours;
        } else if (leaveType === 'sick') {
            sickLeaveHours = leaveHours;
        } else if (leaveType === 'public') {
            publicHolidayLeaveHours = leaveHours;
        }
    }
    
    // Handle public holiday work (gets special rate)
    if (isPublicHoliday && workingHours > 0) {
        return {
            total: workingHours,
            regular: 0,
            overtime: 0,
            publicHoliday: workingHours,
            annualLeave: annualLeaveHours,
            sickLeave: sickLeaveHours,
            publicHolidayLeave: publicHolidayLeaveHours
        };
    }
    
    // Regular work day calculations
    const isThursdayOrFriday = day.includes('Thu') || day.includes('Fri');
    const overtimeStart = new Date(`2024-01-01 18:00`);
    
    let regularHours = workingHours;
    let overtimeHours = 0;
    
    // Calculate overtime for Thu/Fri after 6PM
    if (isThursdayOrFriday && end > overtimeStart) {
        const effectiveOvertimeStart = start > overtimeStart ? start : overtimeStart;
        
        if (effectiveOvertimeStart < end) {
            const overtimeMinutes = (end - effectiveOvertimeStart) / (1000 * 60 * 60);
            overtimeHours = overtimeMinutes;
            regularHours = workingHours - overtimeHours;
        }
    }
    
    return {
        total: workingHours,
        regular: Math.max(0, regularHours),
        overtime: Math.max(0, overtimeHours),
        publicHoliday: 0,
        annualLeave: annualLeaveHours,
        sickLeave: sickLeaveHours,
        publicHolidayLeave: publicHolidayLeaveHours
    };
}

// Authentication Functions
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const validUsers = appState.appConfig.users;
    
    if (validUsers[username] && validUsers[username] === password) {
        appState.isLoggedIn = true;
        appState.currentUser = username;
        showMainApp();
        
        // Save credentials if remember is checked
        if (appState.rememberPassword) {
            const credentialsToSave = {
                username,
                password,
                remember: true
            };
            sessionStorage.setItem(`${appState.appConfig.locationId}-saved-credentials`, JSON.stringify(credentialsToSave));
        } else {
            sessionStorage.removeItem(`${appState.appConfig.locationId}-saved-credentials`);
        }
    } else {
        showLoginError('Invalid username or password');
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('currentUser').textContent = appState.currentUser;
    
    // Load initial data
    loadRosterData();
    renderRosterGrid();
    renderEmployeesList();
    renderLocationsList();
}

function handleLogout() {
    appState.isLoggedIn = false;
    appState.currentUser = '';
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginForm').reset();
    appState.editMode = false;
    appState.activeTab = 'roster';
    sessionStorage.removeItem(`${appState.appConfig.locationId}-saved-credentials`);
}

// Tab Management
function setActiveTab(tabName) {
    appState.activeTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    
    document.getElementById(`${tabName}Tab`).classList.remove('hidden');
}

// Week Navigation
function navigateWeek(direction) {
    const currentWeek = new Date(appState.currentWeekStart);
    if (direction === 'prev') {
        currentWeek.setDate(currentWeek.getDate() - 7);
    } else {
        currentWeek.setDate(currentWeek.getDate() + 7);
    }
    appState.currentWeekStart = currentWeek;
    updateWeekDisplay();
    renderRosterGrid();
}

function updateWeekDisplay() {
    const startDate = new Date(appState.currentWeekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    
    const options = { month: 'short', day: 'numeric' };
    const startStr = startDate.toLocaleDateString('en-US', options);
    const endStr = endDate.toLocaleDateString('en-US', options);
    const year = startDate.getFullYear();
    
    document.getElementById('currentWeekDisplay').textContent = `${startStr} - ${endStr}, ${year}`;
}

// Edit Mode
function toggleEditMode() {
    appState.editMode = !appState.editMode;
    const editBtn = document.getElementById('editModeBtn');
    const saveBtn = document.getElementById('saveRosterBtn');
    
    if (appState.editMode) {
        editBtn.classList.add('hidden');
        saveBtn.classList.remove('hidden');
        editBtn.innerHTML = '<i data-lucide="x" class="w-4 h-4 mr-2"></i>Cancel';
    } else {
        editBtn.classList.remove('hidden');
        saveBtn.classList.add('hidden');
        editBtn.innerHTML = '<i data-lucide="edit-2" class="w-4 h-4 mr-2"></i>Edit Mode';
    }
    
    renderRosterGrid(); // Re-render to enable/disable edit functionality
    lucide.createIcons();
}

// Roster Functions
async function loadRosterData() {
    try {
        updateSyncStatus('syncing');
        const weekKey = getCurrentWeekKey();
        const savedData = await dbService.getRosterData(appState.appConfig.locationId, weekKey);
        
        if (savedData) {
            appState.allRosterData[weekKey] = savedData;
        } else {
            // Initialize with empty data structure
            initializeDefaultRosterData(weekKey);
        }
        
        updateSyncStatus('synced');
    } catch (error) {
        console.error('Failed to load roster data:', error);
        updateSyncStatus('offline');
        initializeDefaultRosterData(getCurrentWeekKey());
    }
}

function initializeDefaultRosterData(weekKey) {
    const days = getCurrentWeekDates();
    const defaultData = {};
    
    appState.locations.forEach(location => {
        defaultData[location] = {};
        days.forEach(day => {
            defaultData[location][day] = [];
        });
    });
    
    appState.allRosterData[weekKey] = defaultData;
}

async function saveRosterData() {
    try {
        updateSyncStatus('syncing');
        const weekKey = getCurrentWeekKey();
        const currentData = appState.allRosterData[weekKey];
        
        const success = await dbService.saveRosterData(
            appState.appConfig.locationId, 
            weekKey, 
            currentData
        );
        
        updateSyncStatus(success ? 'synced' : 'offline');
        
        if (success) {
            console.log('✅ Roster data saved successfully');
        } else {
            console.log('⚠️ Roster data saved locally only');
        }
        
        return success;
    } catch (error) {
        console.error('Failed to save roster data:', error);
        updateSyncStatus('offline');
        return false;
    }
}

function renderRosterGrid() {
    const grid = document.getElementById('rosterGrid');
    const days = getCurrentWeekDates();
    const weekKey = getCurrentWeekKey();
    const rosterData = appState.allRosterData[weekKey] || {};
    
    grid.innerHTML = '';
    
    // Header row
    const employeeHeader = document.createElement('div');
    employeeHeader.className = 'roster-cell header';
    employeeHeader.textContent = 'Employee';
    grid.appendChild(employeeHeader);
    
    days.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'roster-cell header';
        dayHeader.innerHTML = `${day.split(' ')[0]}<br><span class="text-xs text-gray-500">${day.split(' ')[1]}</span>`;
        grid.appendChild(dayHeader);
    });
    
    // Employee rows
    appState.employees.forEach(employee => {
        // Employee name cell
        const nameCell = document.createElement('div');
        nameCell.className = 'roster-cell employee-name';
        nameCell.innerHTML = `<span class="font-medium text-gray-900">${employee}</span>`;
        grid.appendChild(nameCell);
        
        // Day cells
        days.forEach(day => {
            const dayCell = document.createElement('div');
            dayCell.className = 'roster-cell';
            dayCell.dataset.day = day;
            dayCell.dataset.employee = employee;
            
            // Find shifts for this employee on this day across all locations
            let hasShifts = false;
            appState.locations.forEach(location => {
                const locationShifts = rosterData[location]?.[day] || [];
                const employeeShifts = locationShifts.filter(shift => shift.employee === employee);
                
                employeeShifts.forEach(shift => {
                    hasShifts = true;
                    const shiftCard = document.createElement('div');
                    shiftCard.className = 'shift-card';
                    shiftCard.innerHTML = `
                        <div class="font-medium text-xs">${location}</div>
                        <div>${shift.scheduledStart}-${shift.scheduledEnd}</div>
                        ${shift.leaveType ? `<div class="text-xs text-orange-600">${shift.leaveType}</div>` : ''}
                    `;
                    
                    if (appState.editMode) {
                        shiftCard.addEventListener('click', () => openShiftModal(location, day, employee, shift));
                    }
                    
                    dayCell.appendChild(shiftCard);
                });
            });
            
            // Add "Add Shift" button in edit mode
            if (appState.editMode) {
                const addBtn = document.createElement('button');
                addBtn.className = 'btn-ghost w-full text-xs mt-1';
                addBtn.innerHTML = '<i data-lucide="plus" class="w-3 h-3"></i>';
                addBtn.addEventListener('click', () => openShiftModal(null, day, employee, null));
                dayCell.appendChild(addBtn);
            }
            
            grid.appendChild(dayCell);
        });
    });
    
    lucide.createIcons();
}

// Shift Modal Functions
function openShiftModal(location, day, employee, shift) {
    appState.currentEditingShift = { location, day, employee, shift };
    
    const modal = document.getElementById('shiftModal');
    const employeeSelect = document.getElementById('shiftEmployee');
    const locationSelect = document.getElementById('shiftLocation');
    const startTime = document.getElementById('shiftStartTime');
    const endTime = document.getElementById('shiftEndTime');
    const leaveType = document.getElementById('shiftLeaveType');
    
    // Populate employee select
    employeeSelect.innerHTML = '<option value="">Select Employee</option>';
    appState.employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp;
        option.textContent = emp;
        if (emp === employee) option.selected = true;
        employeeSelect.appendChild(option);
    });
    
    // Populate location select
    locationSelect.innerHTML = '<option value="">Select Location</option>';
    appState.locations.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc;
        option.textContent = loc;
        if (loc === location) option.selected = true;
        locationSelect.appendChild(option);
    });
    
    // Set form values
    if (shift) {
        startTime.value = shift.scheduledStart;
        endTime.value = shift.scheduledEnd;
        leaveType.value = shift.leaveType || '';
    } else {
        startTime.value = '09:00';
        endTime.value = '17:00';
        leaveType.value = '';
    }
    
    modal.classList.remove('hidden');
}

function closeShiftModal() {
    document.getElementById('shiftModal').classList.add('hidden');
    appState.currentEditingShift = null;
}

async function saveShift(event) {
    event.preventDefault();
    
    const employee = document.getElementById('shiftEmployee').value;
    const location = document.getElementById('shiftLocation').value;
    const startTime = document.getElementById('shiftStartTime').value;
    const endTime = document.getElementById('shiftEndTime').value;
    const leaveType = document.getElementById('shiftLeaveType').value;
    
    if (!employee || !location) {
        alert('Please select both employee and location');
        return;
    }
    
    const { day } = appState.currentEditingShift;
    const weekKey = getCurrentWeekKey();
    
    // Initialize data structure if needed
    if (!appState.allRosterData[weekKey]) {
        initializeDefaultRosterData(weekKey);
    }
    
    if (!appState.allRosterData[weekKey][location]) {
        appState.allRosterData[weekKey][location] = {};
    }
    
    if (!appState.allRosterData[weekKey][location][day]) {
        appState.allRosterData[weekKey][location][day] = [];
    }
    
    const newShift = {
        employee,
        scheduledStart: startTime,
        scheduledEnd: endTime,
        actualStart: '',
        actualEnd: '',
        leaveType: leaveType || '',
        leaveHours: 0,
        notes: ''
    };
    
    // Add or update shift
    const existingShifts = appState.allRosterData[weekKey][location][day];
    const existingIndex = existingShifts.findIndex(s => s.employee === employee);
    
    if (existingIndex >= 0) {
        existingShifts[existingIndex] = newShift;
    } else {
        existingShifts.push(newShift);
    }
    
    // Save to database
    await saveRosterData();
    
    // Re-render and close modal
    renderRosterGrid();
    closeShiftModal();
}

async function deleteShift() {
    const { location, day, employee } = appState.currentEditingShift;
    const weekKey = getCurrentWeekKey();
    
    if (appState.allRosterData[weekKey]?.[location]?.[day]) {
        appState.allRosterData[weekKey][location][day] = 
            appState.allRosterData[weekKey][location][day].filter(s => s.employee !== employee);
        
        await saveRosterData();
        renderRosterGrid();
    }
    
    closeShiftModal();
}

// Employee Management
function renderEmployeesList() {
    const container = document.getElementById('employeesList');
    container.innerHTML = '';
    
    if (appState.employees.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8">No employees added yet. Click "Add Employee" to get started.</div>';
        return;
    }
    
    appState.employees.forEach(employee => {
        const employeeCard = document.createElement('div');
        employeeCard.className = 'flex items-center justify-between p-4 border border-gray-200 rounded-lg';
        employeeCard.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                    <span class="text-white font-medium">${employee.charAt(0)}</span>
                </div>
                <div>
                    <h3 class="font-medium text-gray-900">${employee}</h3>
                    <p class="text-sm text-gray-500">Employee</p>
                </div>
            </div>
            <div class="flex space-x-2">
                <button class="btn-ghost p-2 edit-employee" data-employee="${employee}">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button class="btn-ghost p-2 text-error delete-employee" data-employee="${employee}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        container.appendChild(employeeCard);
    });
    
    // Add event listeners
    container.querySelectorAll('.edit-employee').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const employee = e.currentTarget.dataset.employee;
            openEmployeeModal(employee);
        });
    });
    
    container.querySelectorAll('.delete-employee').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const employee = e.currentTarget.dataset.employee;
            if (confirm(`Are you sure you want to delete ${employee}?`)) {
                await deleteEmployee(employee);
            }
        });
    });
    
    lucide.createIcons();
}

function openEmployeeModal(employeeName = null) {
    appState.currentEditingEmployee = employeeName;
    
    const modal = document.getElementById('employeeModal');
    const title = document.getElementById('employeeModalTitle');
    const nameInput = document.getElementById('employeeName');
    const submitText = document.getElementById('employeeSubmitText');
    
    if (employeeName) {
        title.textContent = 'Edit Employee';
        nameInput.value = employeeName;
        submitText.textContent = 'Update Employee';
    } else {
        title.textContent = 'Add Employee';
        nameInput.value = '';
        submitText.textContent = 'Add Employee';
    }
    
    modal.classList.remove('hidden');
    nameInput.focus();
}

function closeEmployeeModal() {
    document.getElementById('employeeModal').classList.add('hidden');
    appState.currentEditingEmployee = null;
}

async function saveEmployee(event) {
    event.preventDefault();
    
    const name = document.getElementById('employeeName').value.trim();
    if (!name) return;
    
    if (appState.currentEditingEmployee) {
        // Edit existing employee
        const index = appState.employees.indexOf(appState.currentEditingEmployee);
        if (index >= 0) {
            appState.employees[index] = name;
        }
    } else {
        // Add new employee
        if (!appState.employees.includes(name)) {
            appState.employees.push(name);
        }
    }
    
    // Save to database
    updateSyncStatus('syncing');
    const success = await dbService.saveEmployees(appState.appConfig.locationId, appState.employees);
    updateSyncStatus(success ? 'synced' : 'offline');
    
    renderEmployeesList();
    closeEmployeeModal();
}

async function deleteEmployee(employeeName) {
    appState.employees = appState.employees.filter(emp => emp !== employeeName);
    
    // Save to database
    updateSyncStatus('syncing');
    const success = await dbService.saveEmployees(appState.appConfig.locationId, appState.employees);
    updateSyncStatus(success ? 'synced' : 'offline');
    
    renderEmployeesList();
    renderRosterGrid(); // Re-render roster to remove deleted employee
}

// Location Management
function renderLocationsList() {
    const container = document.getElementById('locationsList');
    container.innerHTML = '';
    
    if (appState.locations.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8 col-span-full">No locations added yet. Click "Add Location" to get started.</div>';
        return;
    }
    
    appState.locations.forEach(location => {
        const locationCard = document.createElement('div');
        locationCard.className = 'border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow';
        locationCard.innerHTML = `
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-gray-900">${location}</h3>
                <div class="flex space-x-2">
                    <button class="btn-ghost p-2 edit-location" data-location="${location}">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button class="btn-ghost p-2 text-error delete-location" data-location="${location}">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            <div class="space-y-2 text-sm text-gray-600">
                <div class="flex items-center">
                    <i data-lucide="map-pin" class="w-4 h-4 mr-2"></i>
                    <span>Business Location</span>
                </div>
                <div class="flex items-center">
                    <i data-lucide="users" class="w-4 h-4 mr-2"></i>
                    <span>Active Location</span>
                </div>
            </div>
            <div class="mt-4">
                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    Active
                </span>
            </div>
        `;
        container.appendChild(locationCard);
    });
    
    // Add event listeners
    container.querySelectorAll('.edit-location').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const location = e.currentTarget.dataset.location;
            openLocationModal(location);
        });
    });
    
    container.querySelectorAll('.delete-location').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const location = e.currentTarget.dataset.location;
            if (confirm(`Are you sure you want to delete ${location}?`)) {
                await deleteLocation(location);
            }
        });
    });
    
    lucide.createIcons();
}

function openLocationModal(locationName = null) {
    appState.currentEditingLocation = locationName;
    
    const modal = document.getElementById('locationModal');
    const title = document.getElementById('locationModalTitle');
    const nameInput = document.getElementById('locationName');
    const submitText = document.getElementById('locationSubmitText');
    
    if (locationName) {
        title.textContent = 'Edit Location';
        nameInput.value = locationName;
        submitText.textContent = 'Update Location';
    } else {
        title.textContent = 'Add Location';
        nameInput.value = '';
        submitText.textContent = 'Add Location';
    }
    
    modal.classList.remove('hidden');
    nameInput.focus();
}

function closeLocationModal() {
    document.getElementById('locationModal').classList.add('hidden');
    appState.currentEditingLocation = null;
}

async function saveLocation(event) {
    event.preventDefault();
    
    const name = document.getElementById('locationName').value.trim();
    if (!name) return;
    
    if (appState.currentEditingLocation) {
        // Edit existing location
        const index = appState.locations.indexOf(appState.currentEditingLocation);
        if (index >= 0) {
            appState.locations[index] = name;
        }
    } else {
        // Add new location
        if (!appState.locations.includes(name)) {
            appState.locations.push(name);
        }
    }
    
    // Save to database (locations are saved as part of app config)
    updateSyncStatus('syncing');
    localStorage.setItem('app-locations', JSON.stringify(appState.locations));
    updateSyncStatus('synced');
    
    renderLocationsList();
    renderRosterGrid(); // Re-render roster to include new location
    closeLocationModal();
}

async function deleteLocation(locationName) {
    appState.locations = appState.locations.filter(loc => loc !== locationName);
    
    // Save to local storage
    localStorage.setItem('app-locations', JSON.stringify(appState.locations));
    
    renderLocationsList();
    renderRosterGrid(); // Re-render roster to remove deleted location
}

// Export Functions
function exportRosterData() {
    const exportData = {
        employees: appState.employees,
        locations: appState.locations,
        allRosterData: appState.allRosterData,
        publicHolidays: appState.publicHolidays,
        exportDate: new Date().toISOString(),
        weekRange: getCurrentWeekString()
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${appState.appConfig.companyName.replace(/\s+/g, '-')}-roster-${getCurrentWeekKey()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Connection Status Functions
function updateConnectionStatus() {
    const statusIndicator = document.querySelector('#connectionStatus .status-indicator');
    const statusText = document.getElementById('connectionText');
    
    if (appState.isOnline) {
        statusIndicator.className = 'status-indicator status-online';
        statusText.textContent = 'Online';
    } else {
        statusIndicator.className = 'status-indicator status-offline';
        statusText.textContent = 'Offline';
    }
}

function updateSyncStatus(status) {
    appState.syncStatus = status;
    const syncIcon = document.querySelector('#syncStatus i');
    const syncText = document.getElementById('syncText');
    
    switch (status) {
        case 'synced':
            syncIcon.setAttribute('data-lucide', 'check-circle');
            syncIcon.className = 'w-4 h-4 text-success';
            syncText.textContent = 'Synced';
            break;
        case 'syncing':
            syncIcon.setAttribute('data-lucide', 'rotate-cw');
            syncIcon.className = 'w-4 h-4 text-warning';
            syncText.textContent = 'Syncing...';
            break;
        case 'offline':
            syncIcon.setAttribute('data-lucide', 'wifi-off');
            syncIcon.className = 'w-4 h-4 text-error';
            syncText.textContent = 'Offline';
            break;
    }
    lucide.createIcons();
}

// Settings Functions
function saveAppConfig() {
    const companyName = document.getElementById('configCompanyName').value;
    const systemTitle = document.getElementById('configSystemTitle').value;
    
    appState.appConfig.companyName = companyName;
    appState.appConfig.systemTitle = systemTitle;
    
    // Update UI elements
    document.getElementById('companyName').textContent = companyName;
    document.getElementById('systemTitle').textContent = systemTitle;
    document.getElementById('headerCompanyName').textContent = companyName;
    document.getElementById('headerSystemTitle').textContent = systemTitle;
    
    // Save to local storage
    localStorage.setItem('app-config', JSON.stringify(appState.appConfig));
    
    alert('Settings saved successfully!');
}

// Test database connection
async function testConnection() {
    updateSyncStatus('syncing');
    const connected = await dbService.initialize(DATABASE_CONFIG);
    
    const indicator = document.getElementById('dbStatusIndicator');
    const text = document.getElementById('dbStatusText');
    
    if (connected) {
        indicator.className = 'status-indicator status-online';
        text.textContent = 'Connected';
        updateSyncStatus('synced');
        alert('Database connection successful!');
    } else {
        indicator.className = 'status-indicator status-offline';
        text.textContent = 'Disconnected';
        updateSyncStatus('offline');
        alert('Database connection failed. Check your configuration.');
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Toggle password visibility
    document.getElementById('togglePassword').addEventListener('click', () => {
        const passwordInput = document.getElementById('password');
        const icon = document.querySelector('#togglePassword i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.setAttribute('data-lucide', 'eye');
            appState.showPassword = true;
        } else {
            passwordInput.type = 'password';
            icon.setAttribute('data-lucide', 'eye-off');
            appState.showPassword = false;
        }
        lucide.createIcons();
    });
    
    // Remember password checkbox
    document.getElementById('rememberPassword').addEventListener('change', (e) => {
        appState.rememberPassword = e.target.checked;
    });
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveTab(btn.dataset.tab);
        });
    });
    
    // Week navigation
    document.getElementById('prevWeek').addEventListener('click', () => navigateWeek('prev'));
    document.getElementById('nextWeek').addEventListener('click', () => navigateWeek('next'));
    
    // Roster controls
    document.getElementById('editModeBtn').addEventListener('click', toggleEditMode);
    document.getElementById('saveRosterBtn').addEventListener('click', async () => {
        await saveRosterData();
        toggleEditMode();
    });
    document.getElementById('exportRosterBtn').addEventListener('click', exportRosterData);
    
    // Employee management
    document.getElementById('addEmployeeBtn').addEventListener('click', () => openEmployeeModal());
    document.getElementById('employeeForm').addEventListener('submit', saveEmployee);
    document.getElementById('cancelEmployeeBtn').addEventListener('click', closeEmployeeModal);
    document.getElementById('closeEmployeeModal').addEventListener('click', closeEmployeeModal);
    
    // Location management
    document.getElementById('addLocationBtn').addEventListener('click', () => openLocationModal());
    document.getElementById('locationForm').addEventListener('submit', saveLocation);
    document.getElementById('cancelLocationBtn').addEventListener('click', closeLocationModal);
    document.getElementById('closeLocationModal').addEventListener('click', closeLocationModal);
    
    // Shift modal
    document.getElementById('shiftForm').addEventListener('submit', saveShift);
    document.getElementById('cancelShiftBtn').addEventListener('click', closeShiftModal);
    document.getElementById('closeShiftModal').addEventListener('click', closeShiftModal);
    document.getElementById('deleteShiftBtn').addEventListener('click', deleteShift);
    
    // Settings
    document.getElementById('saveConfigBtn').addEventListener('click', saveAppConfig);
    document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
    
    // Online/offline detection
    window.addEventListener('online', () => {
        appState.isOnline = true;
        updateConnectionStatus();
        updateSyncStatus('synced');
    });
    
    window.addEventListener('offline', () => {
        appState.isOnline = false;
        updateConnectionStatus();
        updateSyncStatus('offline');
    });
    
    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            if (e.target.id === 'shiftModal') closeShiftModal();
            if (e.target.id === 'employeeModal') closeEmployeeModal();
            if (e.target.id === 'locationModal') closeLocationModal();
        }
    });
}

// Load saved data
function loadSavedData() {
    // Load saved credentials
    const savedCredentials = sessionStorage.getItem(`${appState.appConfig.locationId}-saved-credentials`);
    if (savedCredentials) {
        try {
            const { username, password, remember } = JSON.parse(savedCredentials);
            if (remember) {
                document.getElementById('username').value = username;
                document.getElementById('password').value = password;
                document.getElementById('rememberPassword').checked = true;
                appState.rememberPassword = true;
            }
        } catch (error) {
            console.warn('Failed to load saved credentials:', error);
        }
    }
    
    // Load saved app config
    const savedConfig = localStorage.getItem('app-config');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            Object.assign(appState.appConfig, config);
        } catch (error) {
            console.warn('Failed to load app config:', error);
        }
    }
    
    // Load saved locations
    const savedLocations = localStorage.getItem('app-locations');
    if (savedLocations) {
        try {
            appState.locations = JSON.parse(savedLocations);
        } catch (error) {
            console.warn('Failed to load locations:', error);
        }
    }
    
    // Update UI with loaded config
    document.getElementById('companyName').textContent = appState.appConfig.companyName;
    document.getElementById('systemTitle').textContent = appState.appConfig.systemTitle;
    document.getElementById('developer').textContent = appState.appConfig.developer;
    document.getElementById('configCompanyName').value = appState.appConfig.companyName;
    document.getElementById('configSystemTitle').value = appState.appConfig.systemTitle;
}

// Initialize the application
async function initializeApp() {
    console.log('🚀 Initializing Staff Roster Management System...');
    
    // Load saved data
    loadSavedData();
    
    // Initialize database service
    await dbService.initialize(DATABASE_CONFIG);
    
    // Set up event listeners
    setupEventListeners();
    
    // Update initial displays
    updateWeekDisplay();
    updateConnectionStatus();
    updateSyncStatus(dbService.getConnectionStatus() ? 'synced' : 'offline');
    
    // Initialize icons
    lucide.createIcons();
    
    // Set up database change listener
    dbService.onDataChange((change) => {
        console.log('Database change detected:', change);
        if (change.type === 'roster_updated') {
            renderRosterGrid();
        } else if (change.type === 'employees_updated') {
            renderEmployeesList();
        }
        updateSyncStatus('synced');
    });
    
    console.log('✅ Staff Roster Management System initialized successfully');
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export functions for global access (if needed)
window.RosterApp = {
    appState,
    dbService,
    handleLogin,
    handleLogout,
    setActiveTab,
    navigateWeek,
    toggleEditMode,
    exportRosterData,
    openShiftModal,
    openEmployeeModal,
    openLocationModal
};
