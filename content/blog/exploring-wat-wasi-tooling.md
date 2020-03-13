+++
author = "Radu Matei"
tags = ["wasm"]
date = "2020-03-04"
description = ""
linktitle = ""
title = "Exploring the WebAssembly Text Format, runtimes, and tooling"
summary = ""
image = "/img/article-photos/exploring-wat-wasi-tooling/wasm.png"
draft = true
+++

<!-- ![](/img/article-photos/exploring-wat-wasi-tooling/wasm.png) -->

You have heard about WebAssembly. You might have seen a few examples, or maybe even played around with a few demos.
In this article, we will explore the textual format of WebAssembly, and how to get started with various tools and
runtimes that are available in this space.

First things first - _textual format_? According to the Mozilla Developer Network, WebAssembly is _low-level assembly-like
language with a compact **binary** format_.

[spec]: https://webassembly.github.io/spec/core/exec/index.html
[mdn-concepts]: https://developer.mozilla.org/en-US/docs/WebAssembly/Concepts
