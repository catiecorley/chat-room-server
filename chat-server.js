// Require the packages we will use:
const http = require("http"),
    fs = require("fs");

const port = 3456;
const file = "client.html";
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html, on port 3456:
const server = http.createServer(function (req, res) {
    // This callback runs when a new connection is made to our HTTP server.

    fs.readFile(file, function (err, data) {
        // This callback runs when the client.html file has been read from the filesystem.

        if (err) return res.writeHead(500);
        res.writeHead(200);
        res.end(data);
    });
});
server.listen(port);

// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
    wsEngine: 'ws'
});

var chatrooms = [{'name': "Open to all", 'creator': 'none'}];
var currentusers = [];
var privatechatrooms = [];
// array of user objects with name and array of rooms that they're banned from 
var bannedusers = []; 
//array of words users cannot send
var bannedwords = ['fuck', 'shit', 'bitch', 'ass', 'damn', 'kill', 'hell'];

// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);
io.sockets.on("connect", function (socket) {
    // This callback runs when a new Socket.IO connection is established.
    console.log("id: " + socket.id);
    
    
    socket.on('message_to_server', function (data) {
        // This callback runs when the server receives a new message from the client.

        console.log("message: " + data["message"]); // log it to the Node.JS output
        console.log("user who sent: " + socket.username);
        console.log("room: " + socket.room);
        var currentuser = socket.username;

        var words = data['message'].split(" ");
        var cleanMessage = '';
        for (var x in words){
            for (var y in bannedwords){
                if(words[x] == bannedwords[y]){
                    words[x] = "***";
                }
            }
            cleanMessage += words[x] + " ";
        }
       
        io.sockets.to(socket.room).emit("message_to_client", { message: cleanMessage, user: currentuser });
       
    });

    //joins the room clicked on
    socket.on('join-room', function(roomToJoin){
        console.log("js join-room called");
        socket.leave(socket.room);
        socket.join(roomToJoin);
        socket.room = roomToJoin;
        console.log("current room: " + roomToJoin);

        var banned = false;
        for (var x in bannedusers){
            if (bannedusers[x]['id'] == socket.id){
                for (var y in bannedusers[x]['bannedroom']){
                    if (bannedusers[x]['bannedroom'][y] == roomToJoin){
                        banned = true;
                        socket.leave(roomToJoin);
                        socket.join('Open to all');
                        socket.room = 'Open to all';
                        console.log("user was banned from: " + roomToJoin + " stay in general");
                        io.sockets.to(socket.id).emit('error-blocked');
                    }
                }
            }
        }

        if (roomToJoin != 'Open to all'){ //can still communicate with blocked users in open to all room
        for (var x in currentusers){
            if(currentusers[x]['currentroom'] == roomToJoin){
                console.log("found " + currentusers[x]['nickname'] + " in room");
                for(var y in currentusers[x]['blocked']){
                    if( currentusers[x]['blocked'][y] == socket.id){
                        console.log(currentusers[x]['nickname'] + "has blocked " + socket.username);
                        banned = true;
                        socket.leave(roomToJoin);
                        socket.join('Open to all');
                        socket.room = 'Open to all';
                        console.log("user was blocked by a user. stay in general");
                        io.sockets.to(socket.id).emit('error-blocked');

                    }
                }
            }
        }
    }
            
        
        if(!banned){
        for (var x in currentusers){
            if (currentusers[x]['nickname'] == socket.username){
                currentusers[x]['currentroom'] = roomToJoin;
                console.log(socket.username + " successfully joined " + currentusers[x]['currentroom']);
            }
        }
    

        
        io.sockets.to(socket.id).emit('display-room', socket.room);
    }
    });
    //sends a private message
    socket.on('private-message', function(userid, message){
        console.log("sending private message to: " + userid);

        var words = message.split(" ");
        var cleanMessage = '';
        for (var x in words){
            for (var y in bannedwords){
                if(words[x] == bannedwords[y]){
                    words[x] = "***";
                }
            }
            cleanMessage += words[x] + " ";
        }


        io.sockets.to(userid).emit("message_to_client", { message: cleanMessage, user: socket.username });
    });

    //creates a public chat room
    socket.on('create-room', function(roomname){
        var found = false
        for(var x in chatrooms){
            if (chatrooms[x]['name'] == roomname){
                found = true;
                io.sockets.to(socket.id).emit('error');
            }
        }
        if(!found){
            chatrooms.push({'name': roomname, 'creator': socket.id});
            console.log("added room: " + roomname);
        }
    });

    //creates a private chat room
    socket.on('create-private-room', function(roomname, pass){
        var found = false;
        for (var x in privatechatrooms){
            if(privatechatrooms[x]['roomname'] == roomname){
                found = true;
                io.sockets.to(socket.id).emit('error');
                
            }
        }
        if (!found){
            privatechatrooms.push({'roomname': roomname, 'password': pass, 'creator': socket.id});
            console.log("added private room: " + roomname + " with password: " + pass);
        }
    })
    //sets socket username and logs in a user
    socket.on('login_user', function(username){
        
        for (var x in currentusers){
            if (currentusers[x]['nickname'] == username){
                var found = true;
                io.sockets.to(socket.id).emit('error');
            }
        }
        if(!found){
            socket.username = username;
        socket.room = "Open to all";
        socket.join("Open to all");
        var userscurrentroom = socket.room;
        currentusers.push( {'nickname':username, 'currentroom': userscurrentroom, 'id': socket.id, 'blocked': []} );
        io.sockets.to(socket.id).emit('finish-login', username);
        console.log("added: " + username + "to currentusers");
        }
        
    });

    //gets the current rooms to be displayed
    socket.on('get-rooms', function(){
        console.log("fetching rooms");
        io.sockets.emit("current-rooms", chatrooms, privatechatrooms);
    });

    //retrieves current users to be displayd
    socket.on('get-users', function(){
        var roomsUsers = [];
        for (var x in currentusers){
            
            if(currentusers[x]['currentroom'] == socket.room){
                roomsUsers.push(currentusers[x]['nickname']);
            }
        }

        io.sockets.emit('current-users', currentusers);
        console.log("finding current room members");
        
        for(var y in chatrooms){
            var roomsUsers = [];
            for(var x in currentusers){
                if(currentusers[x]['currentroom'] == chatrooms[y]['name']){
                    roomsUsers.push({'name': currentusers[x]['nickname'], 'id': currentusers[x]['id']});
                }
            }

            io.sockets.to(chatrooms[y]['name']).emit('room-specific-users', roomsUsers);
        }
        for(var y in privatechatrooms){
            var roomsUsers = [];
            for(var x in currentusers){
                if(currentusers[x]['currentroom'] == privatechatrooms[y]['roomname']){
                    roomsUsers.push({'name': currentusers[x]['nickname'], 'id': currentusers[x]['id']});
                }
            }
            console.log("HEREEEE");

            io.sockets.to(privatechatrooms[y]['roomname']).emit('room-specific-users', roomsUsers);
        }
    });
  
    //creator of room can ban user
    socket.on('ban-user',function(user){
        var permission = false;
        for(x in chatrooms){
            if(chatrooms[x]['name'] == socket.room){
                console.log("name of room is " + chatrooms[x]['name'])
                if(chatrooms[x]['creator'] == socket.id ){
                    console.log("permission set to true");
                    permission = true;
                }
            }
        }
        for (y in privatechatrooms){
            if(privatechatrooms[y]['roomname'] == socket.room){
                if(privatechatrooms[y]['creator'] == socket.id){
                    console.log("permission set to true");
                    permission = true;
                }
            }
        }
        console.log("permissions: " + permission)
        if(permission == true){
            console.log("IN IF STATEMENT");
        var currentRoom = socket.room;

        var alreadyBanned = false; 
        if (user != socket.id){
        for (var x in bannedusers){
            if (bannedusers[x]['id'] == user){
                bannedusers[x]['bannedroom'].push(currentRoom);
                alreadyBanned = true; 
                console.log(user +" banned from another room");
            }
        }

        if (!alreadyBanned){
            
            bannedusers.push({'id': user, 'bannedroom':[currentRoom]});
            console.log(user + " was not already banned"); 
              
        }

        io.sockets.to(user).emit('banned-remove', 'Open to all');

        console.log(user + " kicked to general");
    }
}else{
    io.sockets.to(socket.id).emit('wrong-permissions');
}

    });

    //creator of room can kick out users
    socket.on('kick-user', function(user){
        
        if(user!=socket.id){
            var permission = false;
        for(x in chatrooms){
            if(chatrooms[x]['name'] == socket.room){
                if(chatrooms[x]['creator'] == socket.id ){
                    permission = true;
                }
            }
        }
        for (y in privatechatrooms){
            if(privatechatrooms[y]['roomname'] == socket.room){
                if(privatechatrooms[y]['creator'] == socket.id){
                    permission = true;
                }
            }
        }
        if(permission){
        io.sockets.to(user).emit('banned-remove', 'Open to all');
        }else{
            io.sockets.to(socket.id).emit('wrong-permissions');

        }
    }
    });

    //block a user perminantly so they cannot enter same room as you
    socket.on('block-user', function(user){
        if(user != socket.id){
            var alreadyblocked = false;
        for(var x in currentusers){
            if(currentusers[x]['id'] == socket.id){
                for(var y in currentusers[x]['blocked']){
                    if (currentusers[x]['blocked'][y] == uesr){
                        alreadyblocked = true;
                    }
                }
                if (!alreadyblocked){
                    console.log("user was pushed into blocked users");
                currentusers[x]['blocked'].push(user); //adds user from field to current user's blocked users
                }
            }
        }
        io.sockets.to(user).emit('banned-remove', 'Open to all'); //kicks out user
    }
    })

    

    
});