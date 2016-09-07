+++
author = "Radu Matei"
categories = ["aspnet-core", "signalr"]
date = "2016-09-07"
description = ""
linktitle = ""
title = "Getting started with SignalR Core"
type = "post"

+++

Introduction
------------

> ASP.NET SignalR is a library for ASP.NET developers that simplifies the process of adding real-time web functionality to applications. Real-time web functionality is the ability to have server code push content to connected clients instantly as it becomes available, rather than having the server wait for a client to request new data.

The 1.0.0 version of ASP.NET Core didn't include a version of SignalR, so the team plans to release SignalR in the 1.2 iteration of the framework with some functionality that should make any SignalR developer happy: rewrite of the JavaScript client using TypeScript without the jQuery dependency, no more `GlobalHost` and integration with the dependency injection engine from ASP.NET Core, remove the forever frame transport completely or support binary transfer.

> For the complete discussion for the SignalR planning, [see this issue on the GitHub repository](https://github.com/aspnet/SignalR-Server/issues/196).

Since we are almost a year away from the official release of the framework, everything you are about to see is by no means production ready and will most likely suffer breaking changes over time. I will try to keep this article up-to-date with the various changes that will take place around SignalR over time.


At this moment, there is a `0.2.0` alpha version of [`Microsoft.AspNetCore.SignalR.Server`](https://dotnet.myget.org/feed/aspnetcore-dev/package/nuget/Microsoft.AspNetCore.SignalR.Server) that makes it possible to use SignalR with an ASP.NET Core application, but it doesn't implement the changes mentioned above just yet and you still use the same JavaScript client with the jQuery dependency.

Adding NuGet.Config
-------------------

In order to get access to the development packages of SignalR (of any package, really), we need to add a `NuGet.Config` file that allows NuGet to get packages from multiple sources, in our case from the ASP.NET continous integration server from MyGet.

In the same folder as `Program.cs` and `Startup.cs`, add a `NuGet.Config` file with the following content:

```
<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <packageSources>
        <clear/>
            <add key="aspnetcidev" value="https://dotnet.myget.org/F/aspnetcore-ci-dev/api/v3/index.json"/>
            <add key="api.nuget.org" value="https://api.nuget.org/v3/index.json"/>
    </packageSources>
</configuration>
```


Adding the required packages
----------------------------

We need to add the following packages:

```
"Microsoft.AspNetCore.Server.Kestrel":"1.0.0",
"Microsoft.AspNetCore.StaticFiles": "1.0.0",
"Microsoft.AspNetCore.SignalR.Server": "0.2.0-*",
"Microsoft.AspNetCore.WebSockets": "0.2.0-*"
```

Configure the application
-------------------------

Besides the usual configuration needed for a web application, we also need to add support for serving static files. If we use the current directory, the framework will search for a directory called `wwwroot` and serve the file from there.

```
        public static void Main(string[] args)
        {
            var host = new WebHostBuilder()
                .UseKestrel()
                .UseContentRoot(Directory.GetCurrentDirectory())
                .UseStartup<Startup>()
                .Build();

            host.Run();
        }
```

Next we need to add the required services in `Startup`. In the `ConfigureServices` method we need to `AddSignalR`, with support for detailed errors in the browser console.

```
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddSignalR(options => 
        {
            options.Hubs.EnableDetailedErrors = true;
        });
    }
```

Now, in the `Configure` method, we need to serve static files, use websockets and use SignalR:

```
    public void Configure(IApplicationBuilder app)
    {
        app.UseStaticFiles();
        app.UseWebSockets();
        app.UseSignalR();
    }
```

> At this moment, in order to get the framework to use websockets, you need to add `app.UseWebSockets()`. If you don't add the websockets support in your application, the transport will fall back to the next available transport.

> According to [this GitHub issue](https://github.com/aspnet/SignalR-Server/issues/220), it is still not decided wether you will need to add the websockets reference as a separate operation or if it will be included in the `AddSignalR()` call.


At this point, you can add `Hub` classes and JavaScript clients in exactly the same way as for `2.2.0` or `2.2.1`. Note that in future releases this will most likely be different, as changes in the client start appearing.

Adding a Hub class
------------------

The very simple example here, as it is very common in the case of SignalR, a chat :)

We have a `Connect` method used to add a user to a connected users list and a `Send` method that sends a message.


```
public class ChatHub : Hub
    {
        public static List<string> ConnectedUsers;

        public void Send(string originatorUser, string message)
        {
            Clients.All.messageReceived(originatorUser, message);
        }

        public void Connect(string newUser)
        {
            if (ConnectedUsers == null)
                ConnectedUsers = new List<string>();

            ConnectedUsers.Add(newUser);
            Clients.Caller.getConnectedUsers(ConnectedUsers);
            Clients.Others.newUserAdded(newUser);
        }
```

> To keep things simple I didn't use the `OnConnected` override here.


Adding the client
-----------------

We will now create a `wwwroot` directory that will contain all of our static files.

We add a new HTML file called `chat.html` that will simply have an unordered list for the messages, a text input and a button. As you can see, the SignalR script used here is the latest one, `2.2.1`.

```
<!DOCTYPE html>
<html>
<head>
    <title>Awesome Chat Application</title>
	<meta charset="utf-8" />
</head>
<body>
    <style type="text/css">
        .userListDiv{
            float: right;
        }
    </style>

    <ul id="messages"></ul>
    <input type="text" id="messageBox" />
    <input type="button" id="sendMessage" value="Send Message!" />
    <div class="userListDiv">
        <ul id="userList"> </ul>
    </div>

    <script src="http://ajax.aspnetcdn.com/ajax/jQuery/jquery-3.1.0.min.js"></script>
    <script src="http://ajax.aspnetcdn.com/ajax/signalr/jquery.signalr-2.2.1.min.js"></script>
    <script src="signalr/hubs"></script>
    <script src="chat.js"></script>
</body>
</html>
```

We also add a `chat.js` file that contains the SignalR connection and client methods:

```
var userName = prompt("Enter your name: ");
var chat = $.connection.chatHub;
chat.client.messageReceived = function (originatorUser, message) {
    $("#messages").append('<li><strong>' + originatorUser + '</strong>: ' + message);
};

chat.client.getConnectedUsers = function (userList) {
    for (var i = 0; i < userList.length; i++)
        addUser(userList[i]);
};

chat.client.newUserAdded = function (newUser) {
    addUser(newUser);
}

$("#messageBox").focus();

$("#sendMessage").click(function () {
    chat.server.send(userName, $("#messageBox").val());
    $("#messageBox").val("");
    $("#messageBox").focus();
});

$("#messageBox").keyup(function (event) {
    if (event.keyCode == 13)
        $("#sendMessage").click();
});

function addUser(user){
    $("#userList").append('<li>' + user + '</li>');
}

$.connection.hub.logging = true;
$.connection.hub.start().done(function () {
    chat.server.connect(userName);
});
```

Basically, ask the user for a user name, define the client methods that display messages and users and define the behaviour when clicking the button (and for pressing Enter).

Conclusion
----------

This is a very simple example of integrating a very early preview of SignalR Core into an ASP.NET Core application. As the framework evolves, I will try to keep this example up to date.
