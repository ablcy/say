class ChatApp {
    constructor() {
        this.currentUser = null;
        this.currentFriend = null;
        this.messages = {};
        this.friends = [];
        this.baseUrl = window.location.origin;
        this.pollInterval = null;
        this.currentTab = 'chats';
        // 固定运行时间标准为2026-05-04 00:54
        this.startTime = new Date('2026-05-04T00:54:00+08:00');
        this.supabase = null;
        this.realtimeChannel = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadUserData();
        this.startUptimeTimer();
    }

    bindEvents() {
        document.getElementById('login-tab').addEventListener('click', () => this.showLogin());
        document.getElementById('register-tab').addEventListener('click', () => this.showRegister());
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });

        document.getElementById('back-btn').addEventListener('click', () => this.closeChatView());
        document.getElementById('send-btn').addEventListener('click', () => this.send());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.send();
        });

        document.getElementById('add-friend-btn').addEventListener('click', () => this.showAddFriendModal());
        document.getElementById('close-modal-btn').addEventListener('click', () => this.closeAddFriendModal());
        document.getElementById('confirm-add-friend-btn').addEventListener('click', () => this.addFriend());

        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('share-app-btn').addEventListener('click', () => this.shareApp());

        // 头像上传相关
        document.getElementById('upload-avatar-btn').addEventListener('click', () => {
            document.getElementById('avatar-upload-input').click();
        });
        document.getElementById('profile-avatar-container').addEventListener('click', () => {
            document.getElementById('avatar-upload-input').click();
        });
        document.getElementById('avatar-upload-input').addEventListener('change', (e) => this.handleAvatarUpload(e));

        // 图片发送相关
        document.getElementById('image-btn').addEventListener('click', () => {
            document.getElementById('image-upload-input').click();
        });
        document.getElementById('image-upload-input').addEventListener('change', (e) => this.handleImageUpload(e));

        // 修改密码相关
        document.getElementById('change-password-btn').addEventListener('click', () => this.showChangePasswordModal());
        document.getElementById('close-password-modal-btn').addEventListener('click', () => this.closeChangePasswordModal());
        document.getElementById('confirm-change-password-btn').addEventListener('click', () => this.changePassword());
    }

    startUptimeTimer() {
        this.updateUptime();
        setInterval(() => this.updateUptime(), 1000);
    }

    updateUptime() {
        const now = new Date();
        const diff = now - this.startTime;

        if (diff < 0) {
            document.getElementById('uptime-display').textContent = '即将上线';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        let uptimeText = '';
        if (days > 0) {
            uptimeText = `${days}天 ${hours}小时`;
        } else if (hours > 0) {
            uptimeText = `${hours}小时 ${minutes}分`;
        } else if (minutes > 0) {
            uptimeText = `${minutes}分 ${seconds}秒`;
        } else {
            uptimeText = `${seconds}秒`;
        }

        document.getElementById('uptime-display').textContent = `已运行 ${uptimeText}`;
    }

    loadUserData() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            this.currentUser = JSON.parse(storedUser);
            this.loadFriends().then(() => {
                this.loadMessages();
                this.showMainScreen();
                this.startPolling();
            });
        }
    }

    startPolling() {
        this.pollInterval = setInterval(() => {
            if (this.currentUser) {
                this.loadMessages();
            }
        }, 2000);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    showLogin() {
        document.getElementById('login-tab').classList.add('active');
        document.getElementById('register-tab').classList.remove('active');
        document.getElementById('login-form').style.display = 'flex';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-error').textContent = '';
        document.getElementById('register-error').textContent = '';
    }

    showRegister() {
        document.getElementById('register-tab').classList.add('active');
        document.getElementById('login-tab').classList.remove('active');
        document.getElementById('register-form').style.display = 'flex';
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('login-error').textContent = '';
        document.getElementById('register-error').textContent = '';
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        const result = await this.fetchData('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (result.success) {
            this.currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            await this.loadFriends();
            this.loadMessages();
            this.showMainScreen();
            this.startPolling();
        } else {
            document.getElementById('login-error').textContent = result.message || '登录失败';
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-password-confirm').value;

        if (password !== confirmPassword) {
            document.getElementById('register-error').textContent = '两次输入的密码不一致';
            return;
        }

        if (username.length < 3) {
            document.getElementById('register-error').textContent = '用户名至少需要3个字符';
            return;
        }

        const result = await this.fetchData('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (result.success) {
            this.currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            this.friends = [];
            this.messages = {};
            this.showMainScreen();
            this.startPolling();
        } else {
            document.getElementById('register-error').textContent = result.message || '注册失败';
        }
    }

    showMainScreen() {
        document.getElementById('auth-screen').classList.remove('screen');
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-screen').style.display = 'flex';
        this.updateProfile();
        this.renderContactsList();
        this.renderChatList();
    }

    updateProfile() {
        if (this.currentUser) {
            const avatarImg = document.getElementById('profile-avatar-img');
            const avatarText = document.getElementById('profile-avatar');
            
            if (this.currentUser.avatar) {
                avatarImg.src = this.currentUser.avatar;
                avatarImg.style.display = 'block';
                avatarText.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                avatarText.style.display = 'flex';
                avatarText.textContent = this.currentUser.username.charAt(0).toUpperCase();
            }
            
            document.getElementById('profile-username').textContent = this.currentUser.username;
        }
    }

    switchTab(tab) {
        this.currentTab = tab;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.tab === tab) {
                item.classList.add('active');
            }
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        document.getElementById(`tab-${tab}`).classList.add('active');

        const titles = {
            chats: 'YanTalk',
            contacts: '通讯录',
            discover: '发现',
            me: '我'
        };
        document.getElementById('page-title').textContent = titles[tab];

        if (tab === 'contacts') {
            this.renderContactsList();
        } else if (tab === 'chats') {
            this.renderChatList();
        }
    }

    renderChatList() {
        const chatList = document.getElementById('chat-list');

        const friendsWithMessages = this.friends.filter(friend => {
            const msgs = this.messages[friend.id];
            return msgs && msgs.length > 0;
        });

        if (friendsWithMessages.length === 0) {
            chatList.innerHTML = '<div class="empty-state">暂无聊天记录</div>';
            return;
        }

        chatList.innerHTML = friendsWithMessages.map(friend => {
            const friendMessages = this.messages[friend.id] || [];
            const lastMessage = friendMessages[friendMessages.length - 1];
            const unreadCount = this.getUnreadCount(friend.id);

            let avatarContent = '';
            if (friend.avatar) {
                avatarContent = `<img src="${friend.avatar}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                avatarContent = `<span>${friend.username.charAt(0).toUpperCase()}</span>`;
            }

            return `
                <div class="chat-item" data-friend-id="${friend.id}" onclick="app.openChat('${friend.id}')">
                    <div class="avatar">
                        ${avatarContent}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${friend.username}</div>
                        <div class="chat-preview">${lastMessage ? (lastMessage.type === 'image' ? '[图片]' : lastMessage.content) : '暂无消息'}</div>
                    </div>
                    <div>
                        ${lastMessage ? `<div class="chat-time">${lastMessage.time}</div>` : ''}
                        ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    renderContactsList() {
        const contactsList = document.getElementById('contacts-list');

        if (this.friends.length === 0) {
            contactsList.innerHTML = '<div class="empty-state">暂无好友</div>';
            return;
        }

        contactsList.innerHTML = this.friends.map(friend => {
            let avatarContent = '';
            if (friend.avatar) {
                avatarContent = `<img src="${friend.avatar}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                avatarContent = `<span>${friend.username.charAt(0).toUpperCase()}</span>`;
            }

            return `
                <div class="contact-item" data-friend-id="${friend.id}" onclick="app.openChat('${friend.id}')">
                    <div class="avatar">
                        ${avatarContent}
                    </div>
                    <span class="contact-name">${friend.username}</span>
                </div>
            `;
        }).join('');
    }

    getUnreadCount(friendId) {
        const friendMessages = this.messages[friendId] || [];
        return friendMessages.filter(m => !m.read && m.senderId !== this.currentUser.id).length;
    }

    async loadFriends() {
        if (!this.currentUser) return;

        const result = await this.fetchData(`/api/friends/${this.currentUser.id}`);
        if (result.success) {
            this.friends = result.friends;
        }
    }

    async loadMessages() {
        if (!this.currentUser) return;

        let hasNewMessages = false;
        const oldMessages = JSON.parse(JSON.stringify(this.messages));

        for (const friend of this.friends) {
            const result = await this.fetchData(`/api/messages/${this.currentUser.id}/${friend.id}`);
            if (result.success) {
                this.messages[friend.id] = result.messages;
            }
        }

        for (const friend of this.friends) {
            const oldCount = (oldMessages[friend.id] || []).length;
            const newCount = (this.messages[friend.id] || []).length;
            if (newCount > oldCount) {
                hasNewMessages = true;
                break;
            }
        }

        if (hasNewMessages || this.currentTab === 'chats') {
            this.renderChatList();
        }

        if (this.currentFriend) {
            const oldCount = (oldMessages[this.currentFriend.id] || []).length;
            const newCount = (this.messages[this.currentFriend.id] || []).length;
            if (newCount > oldCount) {
                this.renderMessages();
            }
        }
    }

    async loadMessagesForFriend(friendId) {
        if (!this.currentUser) return;

        const result = await this.fetchData(`/api/messages/${this.currentUser.id}/${friendId}`);
        if (result.success) {
            this.messages[friendId] = result.messages;
            this.renderChatList();
            if (this.currentFriend && this.currentFriend.id === friendId) {
                this.renderMessages();
            }
        }
    }

    openChat(friendId) {
        const friend = this.friends.find(f => f.id === friendId);
        if (!friend) return;

        this.currentFriend = friend;
        document.getElementById('chat-friend-name').textContent = friend.username;
        this.renderMessages();
        this.markMessagesAsRead(friendId);
        document.getElementById('chat-view').style.display = 'flex';
    }

    closeChatView() {
        document.getElementById('chat-view').style.display = 'none';
        this.currentFriend = null;
        this.renderChatList();
    }

    async markMessagesAsRead(friendId) {
        const friendMessages = this.messages[friendId] || [];
        friendMessages.forEach(m => m.read = true);

        await this.fetchData('/api/mark-read', {
            method: 'POST',
            body: JSON.stringify({ userId: this.currentUser.id, friendId })
        });

        this.renderChatList();
    }

    renderMessages() {
        const container = document.getElementById('messages-container');

        if (!this.currentFriend) {
            container.innerHTML = '<div class="empty-chat"><p>开始聊天吧！</p></div>';
            return;
        }

        const friendMessages = this.messages[this.currentFriend.id] || [];

        if (friendMessages.length === 0) {
            container.innerHTML = '<div class="empty-chat"><p>开始聊天吧！</p></div>';
            return;
        }

        container.innerHTML = friendMessages.map(msg => {
            const isMine = msg.senderId === this.currentUser.id;
            const sender = isMine ? this.currentUser : this.currentFriend;
            
            let avatarContent = '';
            if (sender && sender.avatar) {
                avatarContent = `<img src="${sender.avatar}" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 50%;">`;
            } else if (sender) {
                avatarContent = `<span style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--talk-blue); color: white; border-radius: 50%; font-size: 16px;">${sender.username.charAt(0).toUpperCase()}</span>`;
            }

            let messageContent = '';
            if (msg.type === 'image') {
                messageContent = `<img src="${msg.content}" alt="" style="max-width: 200px; border-radius: 8px;">`;
            } else {
                messageContent = `<p>${msg.content}</p>`;
            }

            return `
                <div class="message-item" style="display: flex; flex-direction: ${isMine ? 'row-reverse' : 'row'}; margin-bottom: 12px; padding: 0 12px;">
                    <div class="avatar-container" style="flex-shrink: 0; margin-top: 4px;">
                        ${avatarContent}
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: ${isMine ? 'flex-end' : 'flex-start'}; max-width: 70%;">
                        <div style="background: ${isMine ? 'linear-gradient(135deg, var(--talk-blue), var(--talk-dark-blue))' : 'var(--white)'}; color: ${isMine ? 'white' : 'var(--text-primary)'}; padding: 10px 14px; border-radius: ${isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px'}; box-shadow: var(--shadow-sm);">
                            ${messageContent}
                        </div>
                        <span style="font-size: 11px; color: #999; margin-top: 4px; padding: 0 4px;">${msg.time}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    showAddFriendModal() {
        document.getElementById('add-friend-modal').style.display = 'flex';
        document.getElementById('add-friend-input').value = '';
        document.getElementById('add-friend-error').textContent = '';
    }

    closeAddFriendModal() {
        document.getElementById('add-friend-modal').style.display = 'none';
    }

    async addFriend() {
        const friendUsername = document.getElementById('add-friend-input').value.trim();
        const errorElement = document.getElementById('add-friend-error');

        if (!friendUsername) {
            errorElement.textContent = '请输入用户名';
            return;
        }

        if (friendUsername === this.currentUser.username) {
            errorElement.textContent = '不能添加自己为好友';
            return;
        }

        const result = await this.fetchData('/api/add-friend', {
            method: 'POST',
            body: JSON.stringify({ userId: this.currentUser.id, friendUsername })
        });

        if (result.success) {
            this.friends.push(result.friend);
            this.messages[result.friend.id] = [];
            this.closeAddFriendModal();
            this.renderContactsList();
            this.renderChatList();

            await this.loadMessagesForFriend(result.friend.id);

            if (this.messages[result.friend.id] && this.messages[result.friend.id].length > 0) {
                this.renderChatList();
            }
        } else {
            errorElement.textContent = result.message || '添加失败';
        }
    }

    async send() {
        const input = document.getElementById('message-input');
        const content = input.value.trim();
        if (!content) return;

        const result = await this.fetchData('/api/send-message', {
            method: 'POST',
            body: JSON.stringify({
                senderId: this.currentUser.id,
                receiverId: this.currentFriend.id,
                content,
                type: 'text'
            })
        });

        if (result.success) {
            if (!this.messages[this.currentFriend.id]) {
                this.messages[this.currentFriend.id] = [];
            }
            this.messages[this.currentFriend.id].push(result.message);
            input.value = '';
            this.renderMessages();
            this.renderChatList();
        }
    }

    // 头像上传
    async handleAvatarUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('userId', this.currentUser.id);

        try {
            const response = await fetch(`${this.baseUrl}/api/upload-avatar`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.success) {
                this.currentUser.avatar = result.avatar;
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                this.updateProfile();
                this.renderContactsList();
                this.renderChatList();
                this.renderMessages();
            } else {
                alert('上传失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            console.error('上传头像错误:', error);
            alert('上传失败');
        }

        e.target.value = '';
    }

    // 图片发送
    async handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${this.baseUrl}/api/upload-image`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.success) {
                // 发送图片消息
                const sendResult = await this.fetchData('/api/send-message', {
                    method: 'POST',
                    body: JSON.stringify({
                        senderId: this.currentUser.id,
                        receiverId: this.currentFriend.id,
                        content: result.url,
                        type: 'image'
                    })
                });

                if (sendResult.success) {
                    if (!this.messages[this.currentFriend.id]) {
                        this.messages[this.currentFriend.id] = [];
                    }
                    this.messages[this.currentFriend.id].push(sendResult.message);
                    this.renderMessages();
                    this.renderChatList();
                }
            } else {
                alert('上传失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            console.error('上传图片错误:', error);
            alert('上传失败');
        }

        e.target.value = '';
    }

    // 修改密码
    showChangePasswordModal() {
        document.getElementById('change-password-modal').style.display = 'flex';
        document.getElementById('old-password-input').value = '';
        document.getElementById('new-password-input').value = '';
        document.getElementById('confirm-password-input').value = '';
        document.getElementById('change-password-error').textContent = '';
    }

    closeChangePasswordModal() {
        document.getElementById('change-password-modal').style.display = 'none';
    }

    async changePassword() {
        const oldPassword = document.getElementById('old-password-input').value;
        const newPassword = document.getElementById('new-password-input').value;
        const confirmPassword = document.getElementById('confirm-password-input').value;
        const errorElement = document.getElementById('change-password-error');

        if (!oldPassword || !newPassword || !confirmPassword) {
            errorElement.textContent = '请填写完整';
            return;
        }

        if (newPassword !== confirmPassword) {
            errorElement.textContent = '两次输入的新密码不一致';
            return;
        }

        const result = await this.fetchData('/api/change-password', {
            method: 'POST',
            body: JSON.stringify({
                userId: this.currentUser.id,
                oldPassword,
                newPassword
            })
        });

        if (result.success) {
            this.closeChangePasswordModal();
            alert('密码修改成功！');
        } else {
            errorElement.textContent = result.message || '修改失败';
        }
    }

    logout() {
        if (confirm('确定要退出登录吗？')) {
            this.stopPolling();
            localStorage.removeItem('currentUser');
            this.currentUser = null;
            this.currentFriend = null;
            this.messages = {};
            this.friends = [];
            document.getElementById('main-screen').style.display = 'none';
            document.getElementById('auth-screen').classList.add('screen');
            document.getElementById('auth-screen').style.display = 'flex';
            this.showLogin();
        }
    }

    shareApp() {
        const url = window.location.href;
        if (navigator.share) {
            navigator.share({
                title: 'YanTalk',
                text: '来试试 YanTalk，简单好用的聊天工具！',
                url: url
            });
        } else {
            navigator.clipboard.writeText(url);
            alert('链接已复制到剪贴板！');
        }
    }

    async fetchData(url, options = {}) {
        try {
            const defaultOptions = {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            };

            // 如果是FormData，删除Content-Type让浏览器自动设置
            if (options.body instanceof FormData) {
                delete defaultOptions.headers['Content-Type'];
            }

            const response = await fetch(`${this.baseUrl}${url}`, defaultOptions);
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            return { success: false, message: '网络错误' };
        }
    }
}

const app = new ChatApp();
