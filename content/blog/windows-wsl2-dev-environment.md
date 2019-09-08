+++
author = "Radu Matei"
categories = ["wsl2"]
date = "2019-09-03"
description = "3 months of using the fast ring of Windows Insiders, WSL2 and VS Code to build software in Go, TypeScript (and occasionally Rust and .NET Core)"
linktitle = ""
title = "Windows Insiders with WSL2, the new terminal,  and VS Code as full time development environment"
type = "post"
featured = "winterm.PNG"
featuredpath = "/img/article-photos/wsl2-dev/"
images = ["img/article-photos/wsl2-dev/winterm.PNG"]
summary = ""
draft = true
+++

# TL;DR

Here's my development environment - I regularly build things in Go, TypeScript and Rust, and occasionally play around with things like WebAssembly, or .NET Core. I also use Docker almost every day, as well as lots of tools in the Kubernetes ecosystem.
For my editor, I use VS Code, with all the extensions for the various environments, and in the past 5 years, I've used macOS or Linux almost exclusively for development.

In this article we'll explore my first 3 months switching completely to Windows Insiders on the fast ring, using the new terminal, WSL2, and VS Code - you'll see all the things that went well, the things that fail, little annoyances, and crashes.

All the things presented here highly dependent on the setup - you might encounter issues where I have not, or you might have no issues at all in areas I've struggled.  
This is not meant to be a tutorial you follow step by step, and you should be extremely careful with software in early state.

# Previous setup

My setup was made of 3 computers: a Surface Book 2 running the corporate-enrolled Windows 10 Enterprise (that I almost never used), a 13" MacBook Pro, and a Lenovo X1 running Ubuntu that I used as a workstation, connected to mouse, keyboard, and multiple displays.

# Part 1: Windows Insiders

Right after WSL2 was announced, I decided to try it out - and since it was only available on the fast ring of Windows Insiders,

{{< tweet 1139794902718582784 >}}
