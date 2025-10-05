// Vite environment types
/// <reference types="vite/client" />

// Configuration - replace with your actual values
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'; // Cloud Function URL
const REDIRECT_URI = window.location.origin;

// Types
interface Calendar {
    id: string;
    summary: string;
    primary?: boolean;
}

interface OAuthResponse {
    access_token: string;
    user_id: string;
}

interface SetupResponse {
    success: boolean;
    watchesCreated: number;
    message: string;
}

// State management
let accessToken: string | null = null;
let calendars: Calendar[] = [];
let selectedSources: string[] = [];

// DOM elements with proper type assertions
const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const authStatus = document.getElementById('authStatus') as HTMLDivElement;
const step2 = document.getElementById('step2') as HTMLDivElement;
const step3 = document.getElementById('step3') as HTMLDivElement;
const loadingCalendars = document.getElementById('loadingCalendars') as HTMLDivElement;
const calendarList = document.getElementById('calendarList') as HTMLDivElement;
const targetCalendar = document.getElementById('targetCalendar') as HTMLSelectElement;
const newCalendarName = document.getElementById('newCalendarName') as HTMLInputElement;
const setupBtn = document.getElementById('setupBtn') as HTMLButtonElement;
const setupStatus = document.getElementById('setupStatus') as HTMLDivElement;

// Initialize
init();

function init() {
    // Check if returning from OAuth
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        handleOAuthCallback(code);
    }

    // Check if already authenticated
    const storedToken = localStorage.getItem('access_token');
    if (storedToken) {
        accessToken = storedToken;
        loadCalendars();
    }

    // Event listeners
    connectBtn.addEventListener('click', startOAuth);
    setupBtn.addEventListener('click', setupSync);

    // Radio button listeners
    document.querySelectorAll('input[name="targetOption"]').forEach(radio => {
        radio.addEventListener('change', handleTargetOptionChange);
    });

    newCalendarName.addEventListener('input', validateSetupButton);
}

function handleTargetOptionChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    const useExisting = target.value === 'existing';
    targetCalendar.style.display = useExisting ? 'block' : 'none';
    newCalendarName.style.display = useExisting ? 'none' : 'block';
    validateSetupButton();
}

function validateSetupButton(): void {
    const targetOptionElement = document.querySelector('input[name="targetOption"]:checked') as HTMLInputElement;
    if (!targetOptionElement) return;
    
    const targetOption = targetOptionElement.value;
    const isValid = selectedSources.length > 0 && (
        (targetOption === 'existing' && targetCalendar.value) ||
        (targetOption === 'new' && newCalendarName.value.trim())
    );
    setupBtn.disabled = !isValid;
}

function startOAuth() {
    // Redirect to Cloud Function OAuth endpoint
    window.location.href = `${API_URL}/oauth/start?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
}

async function handleOAuthCallback(code: string): Promise<void> {
    try {
        const response = await fetch(`${API_URL}/oauth/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: REDIRECT_URI })
        });

        if (!response.ok) throw new Error('OAuth failed');

        const data: OAuthResponse = await response.json();
        accessToken = data.access_token;
        localStorage.setItem('access_token', accessToken);

        showStatus(authStatus, 'Successfully connected!', 'success');

        // Clear URL parameters
        window.history.replaceState({}, document.title, '/');

        loadCalendars();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showStatus(authStatus, 'Authentication failed: ' + errorMessage, 'error');
    }
}

async function loadCalendars() {
    try {
        step2.classList.remove('hidden');

        const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error('Failed to load calendars');

        const data = await response.json();
        calendars = data.items || [];

        displayCalendars();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showStatus(authStatus, 'Failed to load calendars: ' + errorMessage, 'error');
    }
}

function displayCalendars() {
    loadingCalendars.classList.add('hidden');
    calendarList.classList.remove('hidden');

    // Source calendars (checkboxes)
    calendarList.innerHTML = calendars.map(cal => `
        <div class="calendar-item">
            <input type="checkbox" id="cal-${cal.id}" value="${cal.id}">
            <label for="cal-${cal.id}">${cal.summary}</label>
        </div>
    `).join('');

    // Target calendar (dropdown)
    targetCalendar.innerHTML = '<option value="">Select target calendar...</option>' +
        calendars.map(cal => `<option value="${cal.id}">${cal.summary}</option>`).join('');

    // Add event listeners
    document.querySelectorAll('.calendar-item input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handleCalendarSelection);
    });

    targetCalendar.addEventListener('change', handleTargetSelection);
}

function handleCalendarSelection(e: Event): void {
    selectedSources = Array.from(
        document.querySelectorAll('.calendar-item input[type="checkbox"]:checked')
    ).map(cb => (cb as HTMLInputElement).value);

    if (selectedSources.length > 0) {
        step3.classList.remove('hidden');
    }
}

function handleTargetSelection() {
    validateSetupButton();
}

async function setupSync() {
    setupBtn.disabled = true;
    showStatus(setupStatus, 'Setting up calendar sync...', 'success');

    try {
        const targetOptionElement = document.querySelector('input[name="targetOption"]:checked') as HTMLInputElement;
        if (!targetOptionElement) return;
        const targetOption = targetOptionElement.value;
        let targetCalendarId;

        // Create new calendar if needed
        if (targetOption === 'new') {
            showStatus(setupStatus, 'Creating new calendar...', 'success');
            const createResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    summary: newCalendarName.value.trim()
                })
            });

            if (!createResponse.ok) throw new Error('Failed to create calendar');

            const newCalendar = await createResponse.json();
            targetCalendarId = newCalendar.id;
            showStatus(setupStatus, `Created calendar "${newCalendar.summary}". Setting up sync...`, 'success');
        } else {
            targetCalendarId = targetCalendar.value;
        }

        const response = await fetch(`${API_URL}/setup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                sourceCalendars: selectedSources,
                targetCalendar: targetCalendarId
            })
        });

        if (!response.ok) throw new Error('Setup failed');

        const data = await response.json();
        showStatus(setupStatus, `✓ Sync configured! Watching ${data.watchesCreated} calendars.`, 'success');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showStatus(setupStatus, 'Setup failed: ' + errorMessage, 'error');
        setupBtn.disabled = false;
    }
}

function showStatus(element: HTMLElement, message: string, type: 'success' | 'error'): void {
    element.textContent = message;
    element.className = `status ${type}`;
}
