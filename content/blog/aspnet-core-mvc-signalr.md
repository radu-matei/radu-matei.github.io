+++
author = "Radu Matei"
categories = ["aspnet-core", "azure", "signalr"]
date = "2016-09-09"
description = ""
linktitle = ""
title = "ASP.NET Core MVC and SignalR Core"
type = "post"
summary = "In this article we will explore how to get started with the Alpha 2 version of SignalR for ASP.NET Core 2.0 and understand streaming, sending binary data, using the Redis scaleout and, of course, chat!"

+++


NOTICE
------

[**This article is based on an old version of SignalR and is no longer functional / maintained - it is kept here only for historical purposes, you should visit this article that is current as of November / December 2017! All functionality of this article and much more can be found in the new article!** ](https://radu-matei.com/blog/signalr-core)

Introduction
------------

In this article we will take a look at how to integrate ASP.NET Core MVC with SignalR Core (at the moment of writing this article, the latest version of SignalR is [`0.2.0-alpha1-22107`](https://dotnet.myget.org/feed/aspnetcore-ci-dev/package/nuget/Microsoft.AspNetCore.SignalR.Server)) and how to use the SignalR context outside hubs (and solve the current issues with the custom resolvers that will be detailed later) to update clients.


> This article assumes a basic understanding of ASP.NET Core MVC and will not try to explain all concepts here. [This article](https://radu-matei.github.io/blog/aspnet-core-api/) does an introduction to ASP.NET Core MVC and has the basic application structure needed for this article.

> In order to get started with SignalR Core, [take a look at this article](https://radu-matei.github.io/blog/signalr-core/). 

We will build on [this application](https://radu-matei.github.io/blog/aspnet-core-api/) and add real time functionality to it.

It is a very simple application that will enable the creation of posts (much like messages) and it took us through adding the MVC services, creating models, controllers and consuming some data. Now, we want all connected users to see in real time when somebody adds posts in the page without refreshing it.

Configure the application
-------------------------

 NuGet has the ability to get packages from more than one source, and we need it to download alpha packages that are only available on the MyGet server of the ASP.NET team, besides the ASP.NET Core packages available on NuGet. So in the root of the application add a file called `NuGet.Config` with the following content:

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

Add the required packages
-------------------------

For this application, we will need the Kestrel web server (of course), the MVC packages so we can use controllers, static files so we can have HTML and JavaScript files served, SignalR and WebSockets: 

```
"Microsoft.AspNetCore.Server.Kestrel": "1.0.0",
"Microsoft.AspNetCore.Mvc": "1.0.0",
"Microsoft.AspNetCore.StaticFiles": "1.0.0",
"Microsoft.AspNetCore.SignalR.Server": "0.2.0-*",
"Microsoft.AspNetCore.WebSockets": "0.2.0-*"
```

`Program.cs`
------------
Besides adding the `UseContentRoot` statement, the `Main` method is pretty much standard for an ASP.NET Core application.

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

`Post`, `IPostRepository` and `PostRepository`
----------------------------------------------

[This article](https://radu-matei.github.io/blog/aspnet-core-api/) explains all these components thoroughly, but let's see briefly what each one does:

```
public class Post
{
    public int Id { get; set; }
    public string UserName { get; set; }
    public string Text { get; set; }

    public Post(int id, string userName, string text)
    {
        Id = id;
        UserName = userName;
        Text = text;
    }

    public Post()
    {
    }
}
```

`Post` will be the model that users add in the application. It is a straightforward C# class with three auto-implemented properties and two constructors.

> Each user that enters can publish a post containing his user name and a text, so our Post class only contains two properties for the UserName and Text of the post and an Id.

```
using System.Collections.Generic;

public interface IPostRepository
{
    List<Post> GetAll();
    Post GetPost(int id);
    void AddPost(Post post);
}
``` 

> Regardless of where that data is going to be stored, there should be a consistent way of reading and writing, and we will achieve this through an interface, IPostRepository, that will expose the minimum necessary methods: a method to read all posts, a method to add a post and a method to retrieve a post with a specified id.

```
using System.Collections.Generic;
using System.Linq;

public class PostRepository : IPostRepository
{
    private List<Post> _posts = new List<Post>()
    {
        new Post(1, "Obi-Wan Kenobi","These are not the droids you're looking for"),
        new Post(2, "Darth Vader","I find your lack of faith disturbing")
    };
    public void AddPost(Post post)
    {
        _posts.Add(post);
    }

    public List<Post> GetAll()
    {
        return _posts;
    }

    public Post GetPost(int id)
    {
        return _posts.FirstOrDefault(p => p.Id == id);
    }
}
```

> We implemented the `IPostRepository` interface through an in-memory class called `PostRepository` that holds the data in a list. Since we have the three methods to access the data, there is no need to expose the post list outside the class, so it is be private. Besides the list, we only need to implement the three methods from the interface.

The `PostsController`
--------------------

```
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR.Infrastructure;

public class PostsController : Controller
{
    private IPostRepository _postRepository { get; set; }

    public PostsController(IPostRepository postRepository)
    {
        _postRepository = postRepository;
    }

    [HttpGet]
    public List<Post> GetPosts()
    {
        return _postRepository.GetAll();
    }

    [HttpGet]
    public Post GetPost(int id)
    {
        return _postRepository.GetPost(id);
    }

    [HttpPost]
    public void AddPost(Post post)
    {
        _postRepository.AddPost(post);
    }
}

```

From this controller, we will update all clients when a post was added using SignalR by getting the context of the hub and calling client methods  using a `ConnectionManager`. We will see later how to achieve this.

Add a hub
---------

In this application, we will use the hub as a proxy: clients will not call hub methods directly. SignalR will be used to provide server updates - that is the server notifies all clients that something happened, so the clients must first connect to a hub.

So the hub class will be incredibly simple:

```
using Microsoft.AspNetCore.SignalR;

public class PostsHub : Hub
{
}
```

We will see how to use the hub context outside of the hub a little later.

Camel case issues and custom contract resolvers
------------------------------------------------

At this moment, MVC uses camel case notation to pass JSON to clients. That means that even if on the server you write your class properties with Pascal case notation (as you should!), JavaScript clients would get Camel cased objects.

This behavior is new to ASP.NET Core and was not present in the older versions when SignalR was used and built, so SignalR and its clients all expect Pascal case objects, while the objects passed between MVC and its clients are camel cased. This means we cannot reuse methods across the JavaScript client, thing we cannot tolerate.

So we are going to make SignalR pass objects in camel case. Basically, we are going to "recycle" [this old SignalR GitHub issue](https://github.com/SignalR/SignalR/issues/500#issuecomment-7453751) and adapt it to our versions of ASP.NET and SignalR.


Add a custom contract resolvers
-------------------------------

A first try could be to change the default contract resolver to a `CamelCasePropertyNamesContractResolver()` inside the `ConfigureServices` method:

```
var settings = new JsonSerializerSettings();
settings.ContractResolver = new CamelCasePropertyNamesContractResolver();

var serializer = JsonSerializer.Create(settings);
services.Add(new ServiceDescriptor(typeof(JsonSerializer), 
             provider => serializer, 
             ServiceLifetime.Transient));

```

While this is not far from what we are going to do, at this moment we simply cannot force all components to pass camel case objects because it would break current conventions in place.

Simply put, if you try this the JavaScript client will no longer connect, because all connection and internal communication is transformed to camel case.

We are at the point where we need all of the application objects to be passed camel cased, and all connection and SignalR internal objects to be unmodified. 

We will write a custom contract resolver that looks at the assembly of the object type and if it is not an internal SignalR object (if it is not from the same assembly as `Connection`, a class from SignalR), then it modifies it to be camel case:


```
using System;
using System.Reflection;
using Microsoft.AspNetCore.SignalR.Infrastructure;
using Newtonsoft.Json.Serialization;

    public class SignalRContractResolver : IContractResolver
    {
        private readonly Assembly _assembly;
        private readonly IContractResolver _camelCaseContractResolver;
        private readonly IContractResolver _defaultContractSerializer;

        public SignalRContractResolver()
        {
            _defaultContractSerializer = new DefaultContractResolver();
            _camelCaseContractResolver = new CamelCasePropertyNamesContractResolver();
            _assembly = typeof(Connection).GetTypeInfo().Assembly;
        }


        public JsonContract ResolveContract(Type type)
        {
            if (type.GetTypeInfo().Assembly.Equals(_assembly))
                return _defaultContractSerializer.ResolveContract(type);

            return _camelCaseContractResolver.ResolveContract(type);
        }

    }

```

So in `ConfigureServices` we register our contract resolver very similarly to what we had earlier:

```
var settings = new JsonSerializerSettings();
settings.ContractResolver = new SignalRContractResolver();

var serializer = JsonSerializer.Create(settings);
services.Add(new ServiceDescriptor(typeof(JsonSerializer), 
             provider => serializer, 
             ServiceLifetime.Transient));
```

> Note that most likely, this will be done more elegantly in future releases.

The `Configure` method
-----------------------

Again, the `Configure` method is pretty straightforward: we add static files support, configure MVC and add WebSockets and SignalR.

```
    public void Configure(IApplicationBuilder app)
    {
        app.UseStaticFiles();

        app.UseMvc(routes => 
        {
            routes.MapRoute(
                    name: "default",
                    template: "api/{controller}/{action}/{id?}"
            );
        });

        app.UseWebSockets();
        app.UseSignalR();
    }
```

Calling client methods outside hubs
-----------------------------------

In the previous versions of SignalR, in order to call client methods and manage groups outside a hub you would need to make use of the `GlobalHost`, which is no longer available in the new version.

So we will use an instance of `ConnectionManager`, specifically the `GetHubContext<>()` method. We need to register this service so we can use it in the controller:

`_connectionManager.GetHubContext<PostsHub>().someClientMethod(parameters)`


The `ConfigureServices` method
-------------------------------

```
    public void ConfigureServices(IServiceCollection services)
    {
        var settings = new JsonSerializerSettings();
        settings.ContractResolver = new SignalRContractResolver();

        var serializer = JsonSerializer.Create(settings);

        services.Add(new ServiceDescriptor(typeof(JsonSerializer), 
                     provider => serializer, 
                     ServiceLifetime.Transient));

        services.AddSingleton<IPostRepository, PostRepository>();

        services.AddSignalR(options => 
        {
            options.Hubs.EnableDetailedErrors = true;
        });
        
        services.AddMvc();
    }
```

We added the new contract resolver, we added the `PostRepository` and we added SignalR. Now we need to use it in the controller:

The updated controller
----------------------
```
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR.Infrastructure;

public class PostsController : Controller
{
    private IPostRepository _postRepository { get; set; }
    private IConnectionManager _connectionManager {get; set; }

    public PostsController(IPostRepository postRepository, IConnectionManager connectionManager)
    {
        _postRepository = postRepository;
        _connectionManager = connectionManager;
    }

    [HttpGet]
    public List<Post> GetPosts()
    {
        return _postRepository.GetAll();
    }

    [HttpGet]
    public Post GetPost(int id)
    {
        return _postRepository.GetPost(id);
    }

    [HttpPost]
    public void AddPost(Post post)
    {
        _postRepository.AddPost(post);
        _connectionManager.GetHubContext<PostsHub>().Clients.All.publishPost(post);
    }
}
```

Every time someone adds a new post, all connected users will be notified and will call the `publishPost` method.

The client
----------

The client will be exactly the same as in SignalR 2.2.x:

```
<!DOCTYPE html>
<html>
<head>
    <title></title>
	<meta charset="utf-8" />

    <script src="http://ajax.aspnetcdn.com/ajax/jQuery/jquery-2.2.0.min.js"></script>
    <script src="http://ajax.aspnetcdn.com/ajax/signalr/jquery.signalr-2.2.0.min.js"></script>
    <script src="/signalr/hubs"></script>
</head>
<body>
    
    <input id="userNameInput" type="text" placeholder="Enter your user name..." />
    <input id="textInput" type="text" placeholder="Enter your status..." />

    <button id="publishPostButton">Publish post!</button>

    <ul id="postsList"></ul>
    
    <script type="text/javascript">
        $.ajax({
            url: '/api/Posts/GetPosts',
            method: 'GET',
            dataType: 'JSON',
            success: addPostsList
        });

        function addPostsList(posts) {
            $.each(posts, function (index) {
                var post = posts[index];
                addPost(post);
            });
        }

        function addPost(post) {
            $("#postsList").append(
                    '<li><b>' + post.userName + '</b><br>' + post.text + '</li><br>'
                 );
        }

        var hub = $.connection.postsHub;

        hub.client.publishPost = addPost;

        $("#publishPostButton").click(function () {

            var post = {
                userName: $("#userNameInput").val() || "Guest",
                text: $("#textInput").val()
            };
            $.ajax({
                url: '/api/Posts/AddPost',
                method: 'POST',
                data: post
            });
        });
        
        $.connection.hub.logging = true;
        $.connection.hub.start();
    </script>
</body>
</html>
```

Now if you open two browser tabs and start adding messages, you can see all pages updating in real time.

Conclusion
----------

In this article we saw how to use MVC Core and SignalR for providing real time data to users.

Since SignalR is still in alpha, at this moment there are some issues to be addressed and many breaking changes to come and I will try to keep this example up-to-date. 