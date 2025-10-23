const statusElement = document.getElementById('status');

window.addEventListener('load', () => {
    loadInviteCodes();
    loadCooldown();
});

function setStatus(message, isError = false) {
    if (!statusElement) {
        return;
    }
    statusElement.textContent = message || '';
    statusElement.style.color = isError ? '#e74c3c' : '#3b60e4';
}

async function loadInviteCodes() {
    try {
        const response = await fetch('/api/admin/invitation-codes', {
            credentials: 'include'
        });

        if (!response.ok) {
            await handleError(response);
            return;
        }

        const data = await response.json();
        const list = document.getElementById('inviteCodesList');
        list.innerHTML = '';

        if (!data.invitationCodes.length) {
            const empty = document.createElement('li');
            empty.textContent = 'No invitation codes available.';
            list.appendChild(empty);
            return;
        }

        data.invitationCodes.forEach(code => {
            const item = document.createElement('li');
            item.className = 'code-item';
            const label = document.createElement('span');
            label.innerHTML = `<strong>${code}</strong>`;
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Delete';
            button.addEventListener('click', () => deleteInviteCode(code));
            item.appendChild(label);
            item.appendChild(button);
            list.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load invitation codes:', error);
        setStatus('Failed to load invitation codes.', true);
    }
}

async function addInviteCode() {
    const input = document.getElementById('newInviteCode');
    const code = input.value.trim();

    if (!code) {
        setStatus('Please enter a code before adding.', true);
        return;
    }

    try {
        const response = await fetch('/api/admin/invitation-codes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (!response.ok) {
            setStatus(data.error || 'Failed to add invitation code.', true);
            return;
        }

        input.value = '';
        setStatus('Invitation code added.');
        loadInviteCodes();
    } catch (error) {
        console.error('Failed to add invitation code:', error);
        setStatus('Failed to add invitation code.', true);
    }
}

async function deleteInviteCode(code) {
    if (!confirm(`Delete invitation code "${code}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/invitation-codes/${encodeURIComponent(code)}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            const data = await response.json();
            setStatus(data.error || 'Failed to delete invitation code.', true);
            return;
        }

        setStatus('Invitation code deleted.');
        loadInviteCodes();
    } catch (error) {
        console.error('Failed to delete invitation code:', error);
        setStatus('Failed to delete invitation code.', true);
    }
}

async function loadCooldown() {
    try {
        const response = await fetch('/api/config', {
            credentials: 'include'
        });

        if (!response.ok) {
            await handleError(response);
            return;
        }

        const data = await response.json();
        document.getElementById('cooldownInput').value = data.cooldownSeconds;
    } catch (error) {
        console.error('Failed to load cooldown value:', error);
        setStatus('Failed to load cooldown value.', true);
    }
}

async function updateCooldown() {
    const input = document.getElementById('cooldownInput');
    const cooldownSeconds = parseInt(input.value, 10);

    if (Number.isNaN(cooldownSeconds) || cooldownSeconds < 0) {
        setStatus('Cooldown must be a positive number.', true);
        return;
    }

    try {
        const response = await fetch('/api/admin/cooldown', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ cooldownSeconds })
        });

        const data = await response.json();

        if (!response.ok) {
            setStatus(data.error || 'Failed to update cooldown.', true);
            return;
        }

        setStatus('Cooldown updated.');
    } catch (error) {
        console.error('Failed to update cooldown:', error);
        setStatus('Failed to update cooldown.', true);
    }
}

async function handleError(response) {
    if (response.status === 401) {
        setStatus('Authentication required. Refresh and enter admin credentials.', true);
        return;
    }

    try {
        const data = await response.json();
        setStatus(data.error || 'Request failed.', true);
    } catch (error) {
        setStatus('Request failed.', true);
    }
}
