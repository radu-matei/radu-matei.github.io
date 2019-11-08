+++
author = "Radu Matei"
tags = ["wsl"]
date = "2019-11-07"
title = "Version control for your WSL filesystem with a Dockerfile"
description = ""
summary = ""
image = "/img/article-photos/wsl-versioned-filesystem-docker/wsl-store.png"
+++

![](/img/article-photos/wsl-versioned-filesystem-docker/wsl-store.png)

> Disclaimer: I do not work on the WSL team at Microsoft, and this article represents my experience using WSL in the past months and creating custom distributions.

I've been using [WSL2][install-wsl2] as my primary development environment ever since its launch, together with [VS Code Remote WSL][remote-wsl] and the [new Windows terminal][terminal]. My particular workflows allow me to exclusively use the WSL filesystem and tools, so almost my entire work happens to be a combination of the terminal and VS Code. This means I rely on the configuration of my WSL distribution quite a bit, and I want to be able to quickly re-create it in case of a re-install, or replicate my environment for testing.

Up to this point I didn't have major issues with Windows or WSL, so I didn't need to re-install my system yet. I also don't claim that the experience is perfect, and since WSL2 requires Windows Insiders, proceed with care and at your own risk. This article is not trying to convince you to switch to WSL2, nor it is a step-by-step tutorial on how to configure it. Rather, it is me documenting a declarative approach to creating distributions already configured with the tools for your workflows, and how to version control them.

### Back-up your WSL distribution

The `wsl.exe` tool comes with an `--export` command that allows you to export the file system of your distribution to an archive. This is the easiest way to back-up your distribution if you plan on re-installing your system. Additionally, if you manually configured your instance, you can back-up the entire virtual hard disk.

In both cases, you are creating a snapshot of your file system that contains all files, including temporary files - meaning that your back-up could be tens of GB in size. You could start cleaning up temporary files, downloads, and other unnecessary files, but if you only want a clean environment that contains all of your tools, there could be an easier solution.

### Import a distribution from a filesystem

You can import a distribution from an archived filesystem. That filesystem can be generated using the `--export` command, but this is not a requirement - any valid Linux filesystem should be able to be imported as a WSL distribution (I haven't found documentation yet on things required in the filesystem - I've been able to import distributions based on both Debian and Arch - but check [this issue][wsl-symlink-issue] if your distribution has symlinks for tools in `/bin` or `/sbin`).

A very neat way of defining a Linux filesystem is to create a container (which is made up of a filesystem, among others), then export its filesystem as a `.tar` file - which is exactly what you can import in WSL. This would allow you to:

- create a Dockerfile containing the desired state of the distribution
- build a container image based on the Dockerfile
- run a container based on that image and export its filesystem as an archive
- import the archive as a WSL distribution

Put the Dockerfile and configuration files in a git repository, and you built yourself version control for your distribution.

### Writing a Dockerfile for a WSL distribution

For a complete example have a look at [this repo][dockerfile] - but you can start from a base distribution - Ubuntu 18.04 in this case, and install all the tools you need.

The example below is based on my Dockerfile for building distributions - because I don't want to always run as `root`, this creates another user, adds it to the `sudo` group, and gives the new user ownership over `/home/radu`. I still get `sudo` access, but the password is required. (Setting up the additional user is optional, and not a required step for a working WSL distribution.)

The user password is provided as a build argument - using the `--build-arg pwd=<password>` flag. While this is better than hard-coding the value in the Dockerfile, keep in mind that the value is present in the layers of the built image - so be careful if you are publishing the image to a container registry. You can always put a generic password and change it after booting up the distribution.

```
FROM ubuntu:18.04
ENV HOME /home/radu

RUN apt-get update
RUN apt-get install -y  \
                sudo \
                <instal all tools you need>

RUN useradd -ms /bin/bash radu
RUN usermod -aG sudo radu
RUN sudo chown -R radu /home/radu

ARG pwd
RUN echo radu:${pwd} | chpasswd
USER radu
```

Finally, one thing this Dockerfile does not handle is configuring private keys and passwords. If you are absolutely sure the image will never leave your machine, there is nothing stopping you from copying signing keys, or tokens, or passwords and configuring them.

### Importing the distribution into WSL

First, build the image based on your Dockerfile:

```shell
$ docker build -t my-custom-fs .
$ docker run --name fs -it -d my-custom-fs
$ docker export --output my-custom-fs.tar fs
```

The size of the filesystem depends on what tools you configured. A blank Ubuntu 18.04 filesystem starts at around 60MB, and for example, my configuration is around 4 GB (but it contains multiple SDKs and frameworks, a container runtime, and a full browser, among others).

At this point, you can import the distribution:

```shell
$ wsl --import my-custom-distro .\my-custom-distro-location\ .\my-custom-fs.tar
$ wsl --list --verbose
  NAME                STATE           VERSION
  my-custom-distro    Stopped         2
```

If the version of your distribution is 1, you can convert it using `wsl`, or directly set the default version to be 2. Check [the WSL documentation][set-default] for more on this topic.
If you are using the new Windows terminal, the distribution should be automatically added to your configuration list after restarting the terminal. Otherwise, you can manually open a shell to your distribution using `wsl`:

```shell
$ wsl --distribution my-custom-distro
root@surface:~#
```

If you configured a user, you can pass it to the `wsl` command using the `--user` flag, or you can configure the Windows terminal to always login as that user:

```json
"commandline": "wsl.exe --distribution my-custom-distro --user radu",
```

### Conclusion

In this article, we explored a way of pre-configuring a WSL distribution using a Dockerfile. You can use this method to configure all the tools you use regularly, and version your environment using git.

Thanks for reading!

[install-wsl2]: https://docs.microsoft.com/en-us/windows/wsl/wsl2-install
[terminal]: https://github.com/microsoft/terminal
[remote-wsl]: https://code.visualstudio.com/docs/remote/wsl
[backup-discussion]: https://github.com/microsoft/WSL/issues/2955
[export-article]: https://winaero.com/blog/export-import-wsl-linux-distro-windows-10/
[docker-export]: https://docs.docker.com/engine/reference/commandline/export/
[wsl-symlink-issue]: https://github.com/microsoft/WSL/issues/4371#issuecomment-521107556
[dockerfile]: https://github.com/radu-matei/dotfiles/blob/master/Dockerfile
[set-default]: https://docs.microsoft.com/en-us/windows/wsl/wsl2-install#set-a-distro-to-be-backed-by-wsl-2-using-the-command-line
