+++
author = "Radu Matei"
tags = ["wsl"]
date = "2019-11-09"
title = "Random WSL tips & tricks"
description = ""
summary = ""
image = "/img/article-photos/wsl-versioned-filesystem-docker/wsl-store.png"
+++

### 1. Running GUI applications with an X server

There are lots of situations when you might need to run a graphical application from WSL - I'm not talking about a full desktop environment (although [that also works][xfce]), but individual applications - for developing Electron applications, or running end-to-end browser tests for your web application.

You can achieve this in WSL in two steps:

- install an X server on Windows - I'm using [VcXsrv][x], and you can either launch it right before starting your GUI app on Linux, or have it run at start-up.
- export the `DISPLAY` environment variable on Linux with the IP address of the WSL virtual machine. Because the virtual machine gets an IP address dynamically, you need to get it every time you start WSL - but you can get it dynamically from `/etc/resolv.conf`:

```
export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2; exit;}'):0
```

At this point you can start the application on Linux, and if everything is configured properly, the X server should create the application window:

![](/img/article-photos/random-wsl-tips/gui.gif)

Don't expect perfect animations or 60 FPS - it works well enough to accomplish very specific tasks, but you should probably not use this setup for any resource intensive applications.

### 2. Cross distribution temporary directory

If you used WSL, you probably know that your `C:/` drive is accessible from WSL in `/mnt/c` - what you might now know, however, is that [starting with build 19018][cross], there is a _temporary_ directory that is shared by all your WSL instances - `/mnt/wsl`:

![](/img/article-photos/random-wsl-tips/shared.gif)

Keep in mind, however, that by default the directory is temporary, and everything gets removed when the WSL virtual machine restarts.
(Interestingly enough, Docker Desktop for Windows [leverages cross-distro support][dd] to expose the Docker daemon across distributions.)

### 3. Running native Docker and a Kubernetes cluster

Docker released a [tech preview on Docker for Windows and WSL2][docker-preview] - this removes the Moby Linux VM and runs Docker in a WSL distribution. If you need to use Docker across Windows and WSL, and even between multiple WSL distributions, you should really give it a try!

But if you only need to use Docker within a single WSL distribution, it might be easier to just install Docker natively, [according to the docs][docker-ubuntu], and just start and stop it as you need:

```shell
$ sudo /etc/init.d/docker start
 * Starting Docker: docker         [ OK ]

# do your Docker work

$ sudo /etc/init.d/docker stop
 * Stopping Docker: docker         [ OK ]
```

This way, you're only using resources when you actually need them.

If you have Docker installed, you can use [Kind][kind] to create a local Kubernetes cluster. You can start using any tools you want to interact with your cluster, including [Octant][octant], a very nice dashboard and explorer for clusters - the catch here is that Octant starts a web server locally, then opens the browser - so if you want to run it, you should look at the how to set up an X server.
(You can use the same method to start the [Linkerd][linkerd], or [Brigade][brigade] dashboards.)

![](/img/article-photos/random-wsl-tips/oct.gif)

### 4. `explorer.exe .` starts Windows Explorer in the current directory

If you need a file explorer, you can use the built-in Windows Explorer - from any terminal console, if you type `explorer.exe .`, Windows Explorer will start in the current directory, allowing you to navigate the entire Linux filesystem. If you have multiple running distributions, you can see and interact with all of their filesystems:

![](/img/article-photos/random-wsl-tips/exp2.gif)

### 5. `code .` starts VS Code Remote WSL in the current directory

If you are using [VS Code Remote WSL][remote-wsl], you can directly start a new instance of VS Code from any terminal console by using the `code`, or `code-insiders` commands, followed by the directory you want to open. If you want to reuse a currently opened VS Code instance, you can pass the `-r` flag:

![](/img/article-photos/random-wsl-tips/c.gif)

### 5. Use Windows applications with WSL paths

We've seen earlier that the WSL filesystem is accessible from Windows Explorer - but you can use it from any Windows application - keeping in mind that [cross operating speeds will be slower][speed], you can simply pass the WSL directory path to the Windows application and you can start using it.

Here's GitHub Desktop running on Windows, with a repository from WSL - ideally, you might want to use Linux `git` command line, but this is a great way to review PRs, or view diffs:

![](/img/article-photos/random-wsl-tips/gh.PNG)

### 6. Cleanup processes, terminate instances, shutdown the VM

[Sometimes][code-issue] after closing a window, VS Code doesn't stop all the server processes immediately in WSL - if you want to terminate all VS Code processes, you can use `pkill` to manually terminate all of them:

```shell
$ pkill -f vscode
```

There was a recent [blog post][memory] by the WSL team about improvements to memory reclaim - this is much better in the latest build, but I still find myself manually terminating a distribution, or the entire virtual machine, after a resource intensive operation, or when I finished working within WSL:

```shell
$ powershell.exe wsl.exe --terminate <your-distro>
# OR
$ powershell.exe wsl.exe --shutdown
```

[xfce]: https://github.com/QMonkey/wsl-tutorial
[x]: https://sourceforge.net/projects/vcxsrv/
[cross]: https://docs.microsoft.com/en-us/windows/wsl/release-notes#build-19018
[docker-preview]: https://docs.docker.com/docker-for-windows/wsl-tech-preview/
[dd]: https://engineering.docker.com/2019/10/new-docker-desktop-wsl2-backend/
[docker-ubuntu]: https://docs.docker.com/install/linux/docker-ce/ubuntu/
[kind]: https://kind.sigs.k8s.io/
[octant]: https://github.com/vmware-tanzu/octant
[linkerd]: https://github.com/linkerd/linkerd2
[brigade]: https://github.com/brigadecore/brigade
[remote-wsl]: https://code.visualstudio.com/docs/remote/wsl
[speed]: https://docs.microsoft.com/en-us/windows/wsl/wsl2-ux-changes#cross-os-file-speed-will-be-slower-in-initial-preview-builds
[article]: /blog/wsl-versioned-filesystem-docker/
[memory]: https://devblogs.microsoft.com/commandline/memory-reclaim-in-the-windows-subsystem-for-linux-2/
[code-issue]: https://github.com/microsoft/vscode-remote-release/issues/1244
