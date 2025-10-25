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

async function getInviteCodeUsage(code) {
    // 获取当前邀请码在本周期内剩余可用次数
    try {
        const response = await fetch(`/api/admin/invitation-code-usage/${encodeURIComponent(code)}`, {
            credentials: 'include'
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.leftCount;
    } catch {
        return null;
    }
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

        for (const codeObj of data.invitationCodes) {
            let code, timeWindow, maxCount;
            if (typeof codeObj === 'string') {
                code = codeObj;
                timeWindow = 3600;
                maxCount = 1;
            } else {
                code = codeObj.code;
                timeWindow = codeObj.timeWindow;
                maxCount = codeObj.maxCount;
            }
            const item = document.createElement('li');
            item.className = 'code-item';
            const label = document.createElement('span');
            label.innerHTML = `<strong>${code}</strong> <span style="color:#888;font-size:0.9em;">(周期: ${timeWindow}s, 次数: ${maxCount})</span>`;
            // 新增：显示剩余可用次数
            const usageSpan = document.createElement('span');
            usageSpan.style.marginLeft = '12px';
            usageSpan.style.color = '#e67e22';
            usageSpan.textContent = '剩余: ...';
            getInviteCodeUsage(code).then(leftCount => {
                if (leftCount !== null) usageSpan.textContent = `剩余: ${leftCount}`;
            });
            label.appendChild(usageSpan);
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = '撤销';
            button.addEventListener('click', () => deleteInviteCode(code));
            item.appendChild(label);
            item.appendChild(button);
            list.appendChild(item);
        }
    } catch (error) {
        console.error('加载邀请码时出现错误:', error);
        setStatus('邀请码加载失败！', true);
    }
}

async function addInviteCode() {
    const input = document.getElementById('newInviteCode');
    const timeWindowInput = document.getElementById('newInviteTimeWindow');
    const maxCountInput = document.getElementById('newInviteMaxCount');
    const code = input.value.trim();
    const timeWindow = parseInt(timeWindowInput.value, 10);
    const maxCount = parseInt(maxCountInput.value, 10);

    if (!code || isNaN(timeWindow) || isNaN(maxCount) || timeWindow < 1 || maxCount < 1) {
        setStatus('请填写完整的邀请码、循环时间和使用次数。', true);
        return;
    }

    try {
        const response = await fetch('/api/admin/invitation-codes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code, timeWindow, maxCount })
        });

        const data = await response.json();

        if (!response.ok) {
            setStatus(data.error || '添加邀请码失败', true);
            return;
        }

        input.value = '';
        timeWindowInput.value = 3600;
        maxCountInput.value = 3;
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
