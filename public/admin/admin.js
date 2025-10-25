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
            empty.textContent = '暂时没有可用的邀请码';
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
            button.textContent = '撤销';
            button.addEventListener('click', () => deleteInviteCode(code));
            item.appendChild(label);
            item.appendChild(button);
            list.appendChild(item);
        });
    } catch (error) {
        console.error('加载邀请码时出现错误:', error);
        setStatus('邀请码加载失败！', true);
    }
}

async function addInviteCode() {
    const input = document.getElementById('newInviteCode');
    const code = input.value.trim();

    if (!code) {
        setStatus('请在添加之前输入一个邀请码。', true);
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
            setStatus(data.error || '添加邀请码失败', true);
            return;
        }

        input.value = '';
        setStatus('邀请码已添加');
        loadInviteCodes();
    } catch (error) {
        console.error('添加邀请码时出现错误:', error);
        setStatus('邀请码添加失败！', true);
    }
}

async function deleteInviteCode(code) {
    if (!confirm(`真的要撤销邀请码 "${code}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/invitation-codes/${encodeURIComponent(code)}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            const data = await response.json();
            setStatus(data.error || '撤销邀请码失败！', true);
            return;
        }

        setStatus('邀请码已撤销。');
        loadInviteCodes();
    } catch (error) {
        console.error('撤销邀请码时出现错误:', error);
        setStatus('撤销邀请码失败！', true);
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
        console.error('加载冷却时间时出现错误:', error);
        setStatus('加载冷却时间失败！', true);
    }
}

async function updateCooldown() {
    const input = document.getElementById('cooldownInput');
    const cooldownSeconds = parseInt(input.value, 10);

    if (Number.isNaN(cooldownSeconds) || cooldownSeconds < 0) {
        setStatus('冷却时间必须是正数', true);
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
            setStatus(data.error || '冷却时间更新失败', true);
            return;
        }

        setStatus('冷却时间已更新');
    } catch (error) {
        console.error('更新冷却时间时出现错误:', error);
        setStatus('更新冷却时间失败！', true);
    }
}

async function handleError(response) {
    if (response.status === 401) {
        setStatus('需要身份验证。请刷新并输入管理员凭据。', true);
        return;
    }

    try {
        const data = await response.json();
        setStatus(data.error || '请求失败', true);
    } catch (error) {
        setStatus('请求失败', true);
    }
}
