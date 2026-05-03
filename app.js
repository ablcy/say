class ChatApp {
    constructor() {
        this.currentUser = null;
        this.currentFriend = null;
        this.messages = {};
        this.friends = [];
        this.baseUrl = window.location.origin;
        this.pollInterval = null;
        this.currentTab = 'chats';
        this.startTime = new Date();
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

    async fetchData(url, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${url}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            return { success: false, message: '网络错误' };
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
            document.getElementById('profile-avatar').textContent = this.currentUser.username.charAt(0).toUpperCase();
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
            chats: 'Talk',
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

            return `
                <div class="chat-item" data-friend-id="${friend.id}" onclick="app.openChat('${friend.id}')">
                    <div class="avatar">
                        <span>${friend.username.charAt(0).toUpperCase()}</span>
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${friend.username}</div>
                        <div class="chat-preview">${lastMessage ? lastMessage.content : '暂无消息'}</div>
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

        contactsList.innerHTML = this.friends.map(friend => `
            <div class="contact-item" data-friend-id="${friend.id}" onclick="app.openChat('${friend.id}')">
                <div class="avatar">
                    <span>${friend.username.charAt(0).toUpperCase()}</span>
                </div>
                <span class="contact-name">${friend.username}</span>
            </div>
        `).join('');
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
            return `
                <div class="message ${isMine ? 'sent' : 'received'}">
                    <p>${msg.content}</p>
                    <span class="message-time">${msg.time}</span>
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
                content
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
                title: 'Talk',
                text: '来试试 Talk，简单好用的聊天工具！',
                url: url
            });
        } else {
            navigator.clipboard.writeText(url);
            alert('链接已复制到剪贴板！');
        }
    }
}

const app = new ChatApp();
