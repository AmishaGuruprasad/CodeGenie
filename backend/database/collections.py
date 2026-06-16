from database.mongodb import db 

usersLogin_collection = db.login
chats_collection = db.chat
guests_collection = db.guest
sessions_collection = db.session
pendingUsers_collection = db.pending_users