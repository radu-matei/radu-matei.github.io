+++
author = "Radu Matei"
categories = ["aspnet-core", "signalr", "websockets"]
date = "2016-12-30"
description = ""
linktitle = ""
title = "Creating a WebSockets middleware for ASP .NET Core"
type = "post"

+++

UPDATE - February 2017
----------------------

**[This article describes the latest development of websocket-manager and how to use it in your application](https://radu-matei.github.ioblog/real-time-aspnet-core/).**

While the general aspects provided in this article about creating a websockets middleware for Asp .Net Core are still valid, the specific information about the websocket-manager project have changed, since I updated a lot of parts.

The version of the project described in this article can still be found in the [`blog-article`](https://github.com/radu-matei/websocket-manager/tree/blog-article) branch on GitHub.

Introduction
------------
> WebSocket is a computer communications protocol, providing full-duplex communication channels over a single TCP connection.

> WebSocket is designed to be implemented in web browsers and web servers, but it can be used by any client or server application. The WebSocket Protocol is an independent TCP-based protocol.

> More from [Wikipedia on WebSockets](https://en.wikipedia.org/wiki/WebSocket)


In the traditional paradigm of the web, the client was the one responsible for initiating the communication with a server, and the server could not send data back unless it had been previously requested by the client.

![](/img/article-photos/aspnet-core-websockets-middleware/request.png)


With WebSockets, you can send data between the server and the client over a single TCP connection, and usually WebSockets are used to provide real-time functionality to modern applications.


![](/img/article-photos/aspnet-core-websockets-middleware/sockets.png)

> [Image from pubnub.com](https://www.pubnub.com/wp-content/uploads/2014/09/WebSockets-Diagram.png)

What is this article about?
---------------------------

This article is about WebSockets in ASP.NET Core. We will learn how to use them in a simple web application by building a middleware that manages WebSocket connections and sends messages to multiple clients. 

> You can find a [repository containing the source code of this article on GitHub](https://github.com/radu-matei/websocket-manager/tree/blog-article).

> I created a branch for this article since I will most likely update things in the future. For the latest version, check the `master` or `dev` branches.

For the past few months I've been meaning to write a middleware for ASP .NET Core but never quite got the right idea for it. [I have also been playing with the old SignalR on ASP .NET Core](https://radu-matei.github.io/categories/signalr/) (which by the way, got discontinued and [work is being done in a new repo here](https://github.com/aspnet/signalr)), so I was aware of the WebSockets package but didn't have the chance to play with it.

Then I decided that for a side project I would need some real-time functionality, and since I was on ASP .NET Core and SignalR was not yet ready to be played with, I decided to write a simple middleware to manage WebSocket connections. 

Now, the middleware we are about to build is at most useful if you know the clients will support WebSocket connectivity (unlike a Windows 7 PC for example) and is only intended as an fun side project, in no case having production in mind.

It was also built on the experience I had using SignalR for a while now, so you if find yourself wondering: *Didn't I see something similar with SignalR?*, the answer is most likely *Yes, you did!*. This middleware resembles SignalR in sending real-time data, but only has WebSockets as transport, doesn't handle reconnection events and currently does not support the server and the clients calling each others' methods.

That being said, let's start exploring how to use WebSockets in ASP .NET Core.

Getting started with WebSockets in ASP .NET Core
-------------------------------------------------

There is no point in writing a "WebSockets 101" article since there are a few that explain very well what you need in order to get started and I will list the articles I used when getting started:

  - [the WebSockets repository on GitHub contains all source code for this package](https://github.com/aspnet/websockets) and it really helps you to understand how everything works
  - [article from Brad Merrill that also contains GitHub repository](http://zbrad.github.io/tools/wscore/)
  - [article by Anuraj P from dotnetthoughts](http://dotnetthoughts.net/using-websockets-in-aspnet-core/)

Basically, you need to:

- add a reference to `Microsoft.AspNetCore.WebSockets` in `project.json`
- add `app.UseWebSockets()` in the `Configure` method inside the `Startup` class
- create a response pipeline that handles WebSockets requests

> Both articles referenced above contain step-by-step examples on how to get this working

> [In the official WebSockets repository on GitHub you can find a sample of a full application that echoes all messages received](https://github.com/aspnet/WebSockets/tree/dev/samples/EchoApp).

ASP .NET Core Middleware
-------------------------

First of all, it is important to understand what middleware is and how the new request pipeline works in ASP .NET Core, and there is a [great article on that from the Official ASP .NET Core Documentation](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/middleware).

> Middleware are software components that are assembled into an application pipeline to handle requests and responses. Each component chooses whether to pass the request on to the next component in the pipeline, and can perform certain actions before and after the next component is invoked in the pipeline. Request delegates are used to build the request pipeline. The request delegates handle each HTTP request.

![](/img/article-photos/aspnet-core-websockets-middleware/request-pipeline.png)

> [Image from the Official ASP .NET Core Documentation](https://docs.microsoft.com/en-us/aspnet/core/fundamentals/middleware/_static/request-delegate-pipeline.png)

The new pipeline consists of a series of `RequestDelegate` objects being called one after the next, and each component can perform operations before and after the next delegate, or can short-cirtuit the pipeline, handle the request itself and not pass the context further.

Before writing the middleware itself, we need a few classes that deal with connections and handling messages.

Writing a WebSocket Connection Manager
--------------------------------------

The first thing we notice when using the WebSocket package is that everything is low-level: we deal with individual connections, buffers and cancellation tokens. There is no built-in way of storing sockets, nor are they identified in any way. So we will build a class that keeps all active sockets in a thread-safe collection and assigns each a unique ID, while also maintaning the collection (getting, adding and removing sockets).

```
using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;

namespace WebSocketManager
{
    public class WebSocketConnectionManager
    {
        private ConcurrentDictionary<string, WebSocket> _sockets = new ConcurrentDictionary<string, WebSocket>();

        public WebSocket GetSocketById(string id)
        {
            return _sockets.FirstOrDefault(p => p.Key == id).Value;
        }

        public ConcurrentDictionary<string, WebSocket> GetAll()
        {
            return _sockets;
        }

        public string GetId(WebSocket socket)
        {
            return _sockets.FirstOrDefault(p => p.Value == socket).Key;
        }
        public void AddSocket(WebSocket socket)
        {
            _sockets.TryAdd(CreateConnectionId(), socket);
        }

        public async Task RemoveSocket(string id)
        {
            WebSocket socket;
            _sockets.TryRemove(id, out socket);

            await socket.CloseAsync(closeStatus: WebSocketCloseStatus.NormalClosure, 
                                    statusDescription: "Closed by the WebSocketManager", 
                                    cancellationToken: CancellationToken.None);
        }

        private string CreateConnectionId()
        {
            return Guid.NewGuid().ToString();
        }
    }
}
```

As I said, it holds the sockets and the socket IDs in a concurrent dictionary and deals with getting, adding and removing sockets.


Writing a WebSocket Handler
----------------------------

Now that we have a way of keeping track of the connected clients, we want a class that handles connection and disconnection events and manages sending and receiving messages from the socket. Let's see how a class like this might look like:

```
using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace WebSocketManager
{
    public abstract class WebSocketHandler
    {
        protected WebSocketConnectionManager WebSocketConnectionManager { get; set; }

        public WebSocketHandler(WebSocketConnectionManager webSocketConnectionManager)
        {
            WebSocketConnectionManager = webSocketConnectionManager;
        }

        public virtual async Task OnConnected(WebSocket socket)
        {
            WebSocketConnectionManager.AddSocket(socket);
        }

        public virtual async Task OnDisconnected(WebSocket socket)
        {
            await WebSocketConnectionManager.RemoveSocket(WebSocketConnectionManager.GetId(socket));
        }

        public async Task SendMessageAsync(WebSocket socket, string message)
        {
            if(socket.State != WebSocketState.Open)
                return;

            await socket.SendAsync(buffer: new ArraySegment<byte>(array: Encoding.ASCII.GetBytes(message),
                                                                  offset: 0, 
                                                                  count: message.Length),
                                   messageType: WebSocketMessageType.Text,
                                   endOfMessage: true,
                                   cancellationToken: CancellationToken.None);          
        }

        public async Task SendMessageAsync(string socketId, string message)
        {
            await SendMessageAsync(WebSocketConnectionManager.GetSocketById(socketId), message);
        }

        public async Task SendMessageToAllAsync(string message)
        {
            foreach(var pair in WebSocketConnectionManager.GetAll())
            {
                if(pair.Value.State == WebSocketState.Open)
                    await SendMessageAsync(pair.Value, message);
            }
        }

        public abstract Task ReceiveAsync(WebSocket socket, WebSocketReceiveResult result, byte[] buffer);
    }
}
```

The first thing to notice is that the class is `abstract`. This means **you need to inherit it** and provide actual implementation for the `ReceiveAsync` method, as well as you can `override` the methods marked as `virtual`.

There's the `OnConnected` and `OnDisconnected` methods that are executed whenever a new socket connects or an existing one sends a `Close` message.

These methods are `virtual`, meaning that you can provide your own functionality for connecting and disconnecting events.

There is also the `SendMessageAsync` which sends a message to a specific `socketId` and `SendMessageToAllAsync`, which sends a message to all connected clients.

The middleware itself
---------------------

So far we built classes that help maintaning a record of connected sockets and handle sending and receiving messages to and from those sockets. Now it's time to build the actual middleware:

As any middleware, it needs to receive a `RequestDelegate` for the `next` component in the pipeline, while executing operations on the `HttpContext` before and after invoking the next component, and it needs an `async Task Invoke` method. It doesn't have to inherit or implement anything, just to have the `Invoke` method.

> You will notice in this version of the middleware that the invocation of the `next` component is commented out. This is because an exception thrown by Kestrel when this is the last middleware registered in the pipeline. I will investigate this and update the class as necessary.

```
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace WebSocketManager
{
    public class WebSocketManagerMiddleware
    {
        private readonly RequestDelegate _next;
        private WebSocketHandler _webSocketHandler { get; set; }

        public WebSocketManagerMiddleware(RequestDelegate next, 
                                          WebSocketHandler webSocketHandler)
        {
            _next = next;
            _webSocketHandler = webSocketHandler;
        }

        public async Task Invoke(HttpContext context)
        {
            if(!context.WebSockets.IsWebSocketRequest)
                return;
            
            var socket = await context.WebSockets.AcceptWebSocketAsync();
            await _webSocketHandler.OnConnected(socket);
            
            await Receive(socket, async(result, buffer) =>
            {
                if(result.MessageType == WebSocketMessageType.Text)
                {
                    await _webSocketHandler.ReceiveAsync(socket, result, buffer);
                    return;
                }

                else if(result.MessageType == WebSocketMessageType.Close)
                {
                    await _webSocketHandler.OnDisconnected(socket);
                    return;
                }

            });
            
            //TODO - investigate the Kestrel exception thrown when this is the last middleware
            //await _next.Invoke(context);
        }

        private async Task Receive(WebSocket socket, Action<WebSocketReceiveResult, byte[]> handleMessage)
        {
            var buffer = new byte[1024 * 4];

            while(socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(buffer: new ArraySegment<byte>(buffer),
                                                       cancellationToken: CancellationToken.None);

                handleMessage(result, buffer);                
            }
        }
    }
}
```

The middleware is passed an implementation of `WebSocketHandler` and a `RequestDelegate`. If the request is not a WebSocket request, it just exits the middleware.

If it is a WebSockets request, then it accepts the connection and passes the socket to the `OnConnected` method from the `WebSocketHandler`.

Then, while the socket is in the `Open` state, it awaits for the receival of new data. When it receives the data, it decides wether to pass the context to the `ReceiveAsync` method of `WebSocketHandler` (notice why you need to pass an actual implementation of the abstract `WebSocketHandler` class) or to the `OnDisconnected` method (if the message type is `Close`).

And basically this is the middleware. There is also a static class for adding extension methods that we will cover briefly.

The extension methods for adding the middleware
-----------------------------------------------

Most likely in modern applications you want to send notifications and messages only to clients connected to a specific part of the application (think SignalR Hubs).

With this middleware, you can map different paths of your application with specific implementations of `WebSocketHandler`, so you would get completely isolated environments (and different instances of `WebSocketConnectionManager`, but more on this later).

So mapping the middeware is done using the following extension method on `IApplicationBuilder`:

```
        public static IApplicationBuilder MapWebSocketManager(this IApplicationBuilder app, 
                                                              PathString path,
                                                              WebSocketHandler handler)
        {
            return app.Map(path, (_app) => _app.UseMiddleware<WebSocketManagerMiddleware>(handler));
        }
```

It receives a path and it maps that path using with the `WebSocketManagerMiddleware` which is passed the specific implementation of `WebSockethandler` you provided as argument for the `MapWebSocketManager` extension method.

You also need to add some services in order to use them, and this is done in another extension method on `IServiceCollection`:

```
        public static IServiceCollection AddWebSocketManager(this IServiceCollection services)
        {
            services.AddTransient<WebSocketConnectionManager>();

            foreach(var type in Assembly.GetEntryAssembly().ExportedTypes)
            {
                if(type.GetTypeInfo().BaseType == typeof(WebSocketHandler))
                {
                    services.AddSingleton(type);
                }
            }

            return services;
        }
```

Besides from adding the `WebSocketConnectionManager` service, it also searches the executing assemly for types that inherit `WebSocketHandler` and it registers them as singleton (so that every request gets the same instance of the message handler) using reflection.

And this is pretty much the middleware. Now we will take a look at how we would use it in ASP .NET Core applications, and just like in the case of SignalR, there are two scenarios for usage:

- one where the client actually sends WebSockets requests
- one where the client does some MVC stuff and the other clients get notified

> At this moment the samples only handle string as messages, but I will handle JSON messages being sent.

Scenario 1 - Client Sending messages through WebSockets
------------------------------------------------

> You can [find the working application and the source code on GitHub here](https://github.com/radu-matei/websocket-manager/tree/blog-article/samples/ChatApplication).

Using the middleware we just created we will build a chat application (I know, everybody demoes chat applications when playing around with WebSockets).

Besides being a public chat application, it will also be able to map very basic *chat rooms* by creating (in this example) two message handlers and isolating clients from one page from the others.

As I said earlier, in order to configure the newly created pipeline, we need to call the extension method `MapWebSocketManager` in the following way:


`app.MapWebSocketManager("/path", instanceOfWebSocketHandler);`

Let's see a real project's `Startup` class:

```
using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

using WebSocketManager;

namespace ChatApplication
{
    public class Startup
    {
        public void Configure(IApplicationBuilder app, IServiceProvider serviceProvider)
        {
            app.UseWebSockets();

            app.MapWebSocketManager("/ws", serviceProvider.GetService<ChatMessageHandler>());
            app.MapWebSocketManager("/test", serviceProvider.GetService<TestMessageHandler>());

            app.UseStaticFiles();
        }

        public void ConfigureServices(IServiceCollection services)
        {
            services.AddWebSocketManager();
        }
    }
}
```

First we need to `UseWebSockets()` (working on putting this inside the extension methods so you don't call it manually), then map the paths you want to be handled by the middleware.

We said that we need to pass the `MapWebSocketManager` method an implementation of `WebSocketHandler`. Remember that in the extension method we registered all types that inherited `WebSocketHandler` as singletons in the framework. So at this moment we can use the `IServiceProvider` to give us instances of those classes.

Let's have a look at an actual implementation of `WebSocketHandler`, `ChatMessageHandler`:

```
using System.Net.WebSockets;
using System.Text;
using System.Threading.Tasks;
using WebSocketManager;

namespace ChatApplication
{
    public class ChatMessageHandler : WebSocketHandler
    {
        public ChatMessageHandler(WebSocketConnectionManager webSocketConnectionManager) : base(webSocketConnectionManager)
        {
        }

        public override async Task OnConnected(WebSocket socket)
        {
            await base.OnConnected(socket);

            var socketId = WebSocketConnectionManager.GetId(socket);
            await SendMessageToAllAsync($"{socketId} is now connected");
        }

        public override async Task ReceiveAsync(WebSocket socket, WebSocketReceiveResult result, byte[] buffer)
        {
            var socketId = WebSocketConnectionManager.GetId(socket);
            var message = $"{socketId} said: {Encoding.UTF8.GetString(buffer, 0, result.Count)}";

            await SendMessageToAllAsync(message);
        }
    }
}
```

It overrides the `OnConnected` method to send a message to everybody broadcasting that a new client connected and it implements the `ReceiveAsync` method (by just broadcasting the method to all clients).

Basically, `TestMessageHandler` does mostly the same things, but in a real world application you would have different functionality.

Now let's add a web client that connects through WebSockets:

```
<!DOCTYPE html>
<html>

<head>
	<meta charset="utf-8" />
	<title>Real-Time Notifications</title>
</head>

<body>
    <h1>This should be mapped to "/ws"</h1>
	<input type=text id="textInput" placeholder="Enter your text"/>
	<button id="sendButton">Send</button>

	<ul id="messages"></ul>

    	<script language="javascript" type="text/javascript">
        var uri = "ws://" + window.location.host + "/ws";
        function connect() {
            socket = new WebSocket(uri);
            socket.onopen = function(event) {
                console.log("opened connection to " + uri);
            };
            socket.onclose = function(event) {
                console.log("closed connection from " + uri);
            };
            socket.onmessage = function(event) {
                appendItem(list, event.data);
                console.log(event.data);
            };
            socket.onerror = function(event) {
                console.log("error: " + event.data);
            };
        }
        connect();
        var list = document.getElementById("messages");
        var button = document.getElementById("sendButton"); 
        button.addEventListener("click", function() {
            
            var input = document.getElementById("textInput");
            sendMessage(input.value);
            
            input.value = "";
        });
        function sendMessage(message) { 
            console.log("Sending: " + message);
            socket.send(message);
        }
        function appendItem(list, message) {
            var item = document.createElement("li");
            item.appendChild(document.createTextNode(message));
            list.appendChild(item);
        }    
    </script>
</body>
</html>
```

This is a very simple web page that has an input form and a button. It connects to the server on the "/ws" path, so all requests will be mapped to `ChatMessageHandler`.

![](/img/article-photos/aspnet-core-websockets-middleware/chat.gif)

We can see that messages are passed real-time to all connected clients. Let's add another page that connects to a different path - "/test" and pass another handler, `TestMessageHandler` and another client, `test.html`.

> Remember that you can [find the full working sample on GitHub here](https://github.com/radu-matei/websocket-manager/tree/blog-article/samples/ChatApplication).

Let's see what happens now:

![](/img/article-photos/aspnet-core-websockets-middleware/separate-chat.gif)

You can clearly see that clients receive messages based on the page they are connected to.

In this case, clients would send data directly through a websocket and the socket events would get handled directly in the specific implementation of `WebSocketHandler`.

Scenario 2 - Receiving real-time notifications from a controller
----------------------------------------------------------------

This time we will build an MVC application and have client send data through the MVC pipeline. Then, the notifications would get fired from within the controller.

> You can [find the sample on GitHub, in the `MvcSample` folder](https://github.com/radu-matei/websocket-manager/tree/blog-article/samples/MvcSample).

We will build a standard MVC application and we will add the `WebSocketManagerMiddleware` we created. [Here's the `Startup` class of this application](https://github.com/radu-matei/websocket-manager/blob/blog-article/samples/MvcSample/Startup.cs):

```
    public class Startup
    {
        public void Configure(IApplicationBuilder app, IServiceProvider serviceProvider)
        {
            app.UseStaticFiles();
            app.UseWebSockets();

            app.UseMvc(routes =>
            {
                routes.MapRoute(
                    name: "default",
                    template: "api/{controller}/{action}/{id?}"
                );
            });

            app.MapWebSocketManager("/notifications", serviceProvider.GetService<NotificationsMessageHandler>());
        }

        public void ConfigureServices(IServiceCollection services)
        {
            services.AddMvc();
            services.AddWebSocketManager();
        }
    }
```

Since this time the handler class only manages the connected clients and will not handle requests itself, we can leave the `ReceiveAsync` method unimplemented:

```
    public class NotificationsMessageHandler : WebSocketHandler
    {
        public NotificationsMessageHandler(WebSocketConnectionManager webSocketConnectionManager) : base(webSocketConnectionManager)
        {
        }

        public override Task ReceiveAsync(WebSocket socket, WebSocketReceiveResult result, byte[] buffer)
        {
            throw new NotImplementedException();
        }
    }
```

And the controller:

```
    public class MessagesController : Controller
    {
        private NotificationsMessageHandler _notificationsMessageHandler { get; set; }

        public MessagesController(NotificationsMessageHandler notificationsMessageHandler)
        {
            _notificationsMessageHandler = notificationsMessageHandler;
        }

        [HttpGet]
        public async Task SendMessage([FromQueryAttribute]string message)
        {
           await _notificationsMessageHandler.SendMessageToAllAsync(message);
        }
    }
```

In the controller we will have a `NotificationsMessageHandler` instance that will handle the sending of notifications to all connected clients.

The HTML page is very similar to the previous ones, but this time the message will be sent using the API we created, so through HTTP and not WebSockets, so basically only the `sendMessage` method is different:

```
        function sendMessage(message) { 
            console.log("Sending: " + message);
            
            $.ajax({
                url: "http://" + window.location.host + "/api/messages/sendmessage?message=" + message,
                method: 'GET'
            });
        }
```

> Notice I only added `jQuery` so the HTTP request would be simpler (using `AJAX`), it has noting to do with the WebSockets.

Let's see how it works:

![](/img/article-photos/aspnet-core-websockets-middleware/mvc-sample.gif)

Basically, the user doesn't see any difference, but the client is sending data through an HTTP request and receiving it through WebSockets.

Extra - Console client
----------------------

You can also use a C# console client to connect to the application we created.

> You can [find the source code of this sample on GitHub here](https://github.com/radu-matei/websocket-manager/blob/blog-article/samples/EchoConsoleClient/Program.cs)

> Note that this console client is pretty much [a clone of a WebSocket sample from the SignalR repository](https://github.com/aspnet/SignalR/blob/dev/samples/WebSocketSample/Program.cs)

This sample uses the `System.Net.WebSockets` namespace which contains the `ClientWebSocket` class (pretty weird name if you ask me).

```
using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace EchoConsoleClient
{
    public class Program
    {
        public static void Main(string[] args)
        {
            RunWebSockets().GetAwaiter().GetResult();
        }

        private static async Task RunWebSockets()
        {
            var client = new ClientWebSocket();
            await client.ConnectAsync(new Uri("ws://localhost:5000/test"), CancellationToken.None);

            Console.WriteLine("Connected!");

            var sending = Task.Run(async() => 
            {
                string line;
                while((line = Console.ReadLine()) != null && line != String.Empty)
                {
                    var bytes = Encoding.UTF8.GetBytes(line);

                    await client.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
                }

                await client.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
            });

            var receiving = Receiving(client);

            await Task.WhenAll(sending, receiving);
        }

        private static async Task Receiving(ClientWebSocket client)
        {
            var buffer = new byte[1024 * 4];

            while(true)
            {
                var result = await client.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                if(result.MessageType == WebSocketMessageType.Text)
                    Console.WriteLine(Encoding.UTF8.GetString(buffer, 0, result.Count));

                else if(result.MessageType == WebSocketMessageType.Close)
                {
                    await client.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                    break;
                }
            }
        }
    }
}
```

At this point there is no high level client for WebSockets, so this is how you manage the connection from the client perspective.

> Note that both the Chat application and this console client sample must be running.

![](/img/article-photos/aspnet-core-websockets-middleware/console-sample.gif)

> Note that in order for a Terminal console to appear when starting the application you need to set the `"externalConsole": true` in `launch.json` in VS Code.

Next Steps
-----------

In the first place, I should investigate why Kestrel throws an exception when this is the last middleware in the pipeline (maybe it is the intended behaviour?). Then, I should also decide wether I have to create a class that wraps the socket ID and the socket itself in a single object (not sure wether I need this or not).

Another thing I want to do is to see if there is a way to know wether a middleware has been added to the pipeline (so I place `app.UseWebSockets()` in the extension method and not have the user add it). I know that [there is a private field on `ApplicationBuilder` called `_components` that holds all added middleware, but it is not accessible from `app`](https://github.com/aspnet/HttpAbstractions/blob/master/src/Microsoft.AspNetCore.Http/Internal/ApplicationBuilder.cs/#L16), and also understand what happens if you add the same middleware twice.

This started as a fun side project (and I am pretty sure it will stay this way once SignalR becomes ready for production). Still, if I found the time, I would love to **implement the client and server calling each others' methods bit from SignalR**. I find it to be really cool and think there are some cool things to learn from there.

And last but not least, I will investigate sending JSON objects as messages rather than simple strings and the necessity of writing JavaScript and C# clients. Most likely that won't happen, but it would be nice if I had the time.

Conclusion
----------

Let's take a step back and see what we have done:

- we've started by investigating the `WebSocekts` package from ASP .NET Core
- we've taken a look at ASP .NET Core middleware
- we've written a connection manager for WebSocket connections
- we've written an abstract handler class that deals with connection and disconnection events, while also sending and receiving messages
- we've built the actual middleware
- we've added some extension methods to register services and add the middleware in the pipeline
- then we built some samples that demonstrate:
 - how to write a pure-sockets chat application
 - how to integrate this middleware with MVC and send notifications to connected clients
 - how to build a very simple console client written in C#

Feedback wanted
---------------

If you stumbled upon this article, please take a moment and provide some feedback both on the middleware itself and on the way the article is written. Any feedback is immensely appreciated, as well as questions and observations.

Also, if you want to [contribute to this middleware, you can find the repository on GitHub](https://github.com/radu-matei/websocket-manager). Any contribution is greatly appreciated.

Thanks for reading! :)
-------------------