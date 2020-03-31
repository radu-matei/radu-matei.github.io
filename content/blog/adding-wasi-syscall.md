---
title: "A beginner's guide to adding a new WASI syscall in Wasmtime"
description: "In this article, we explore how to add a new system call to WASI, the WebAssembly System Interface, and implement it in Wasmtime"
summary: "In this article, we explore how to add a new system call to WASI, the WebAssembly System Interface, and implement it in Wasmtime"
date: 2020-03-31 00:00:00 +0000 UTC
author: "Radu Matei"
tags: ["wasm"]
image: ""
---

[WebAssembly (WASM)][wasm] _is a binary instruction format for a stack-based virtual machine._
In familiar terms, WASM is used as a compilation target for various programming languages (C, C++, or Rust, for example),
generating a compact binary with a known format. Despite the name, WebAssembly is not a technology that can be used only on the web.
While most initial use cases for it came from browsers, [the core specification][spec] does not assume a browser runtime, but rather
describes the binary and text formats for modules, types, values, and instruction types. And as a result, there are multiple runtimes
implemented for various scenarios, both in and outside of browser environments.

[WASI, the WebAssembly System Interface][wasi-overview], is a capability-oriented set of APIs designed to standardize the
sandboxed execution of WebAssembly modules outside of browsers.
Specifically, WASI aims to be the common layer that WebAssembly modules can use to interface with host runtimes, and get granular
access to OS specific objects such as files, environment variables, or networking sockets.
Because of the apparent resemblance to OS system calls, the API functions exposed by WASI are often referred to as `syscalls`, term
used by this article as well.
For an introduction to the goals and architecture of WASI, head over to the Mozilla blog and read [Lin Clark's announcement post][wasi-announcement].

In this article we will explore how to add such a function interface to WASI, and how to implement it in [Wasmtime][wasmtime-site], one
WebAssembly runtimes that implements the WASI specification. This article is not intended to be a tutorial on _using_ WASI as a compilation
target for your applications (see [the official tutorial][wasi-tutorial]), but document my experience in learning how to add such a
system call to WASI and a very simple implementation to Wasmtime.
The article is based on the talk [Josh Triplett][josh] gave in December at the [WebAssembly San Francisco meetup][wasmsf], and updated
to the significant API changes that happened to the WASI and Wasmtime projects since December, with the very prompt help of [Jakub Konka][jakub].

[To get started][contributing], first clone the Wasmtime repository:

```console
$ git clone --recursive https://github.com/bytecodealliance/wasmtime
```

> If you want to avoid any changes made to the Wasmtime repository since writing this article, you can checkout [this revision][repo-revision] of
> the repository.

### How is the WASI API defined?

The WASI API is declared using [`witx`][witx], an experimental file format based on the [WebAssembly Text Format][wat], with added
support for [module types][module-types] and [annotations][annotations].
WASI also uses a three-phase process for making changes to the API, with [`ephemeral`][ephemeral], [`snapshot`][snapshot],
and [`old`][old] phases that define the stability for a given API. [This document][wasi-phases] describes how the phases are used
in which development cycle.

If you cloned the Wasmtime repository recursively, you should have the WASI repository pulled as a submodule in `crates/wasi-common/WASI`.

As mentioned, the `.witx` file format should be familiar if you have worked with `.wat` files - for example, this is how the `args_sizes_get`
function is declared in the `snapshot` phase:

```console
;;; Return command-line argument data sizes.
(@interface func (export "args_sizes_get")
  (result $error $errno)
  ;;; The number of arguments.
  (result $argc $size)
  ;;; The size of the argument string data.
  (result $argv_buf_size $size)
)
```

We note that this is exports a function called `args_sizes_get`, which does not accept any parameters, and which returns any error and its error code,
together with the number of arguments, and the size of the argument string data.

So let's declare a new WASI API function. We add it to the `snapshot` phase - and the right `.witx` file can be found in:

`crates/wasi-common/WASI/phases/snapshot/witx/wasi_snapshot_preview1.witx`.

We add a very simple function, `print_greeting`, which does not take any arguments, and returns potential errors:

```
diff --git a/phases/snapshot/witx/wasi_snapshot_preview1.witx b/phases/snapshot/witx/wasi_snapshot_preview1.witx
index 98cd947..9c74dae 100644
--- a/phases/snapshot/witx/wasi_snapshot_preview1.witx
+++ b/phases/snapshot/witx/wasi_snapshot_preview1.witx
@@ -529,4 +529,9 @@
     (param $how $sdflags)
     (result $error $errno)
   )
+
+  ;;; Print a greeting message.
+  (@interface func (export "print_greeting")
+    (result $error $errno)
+  )
 )
```

> Tip: you can get basic syntax highlighting for `.witx` files using this [VS Code extension for WebAssembly][vscode-wasm] and set the
> file type as WebAssembly Text Format.

By _declaring_ our `print_greeting` API we achieved half of our goal. Now we must also provide an actual implementation for it.

### How does Wasmtime implement the WASI API?

At this point, if you try to build the main Wasmtime repository with the updated `.witx` file, you will see the following error:

```
error[E0046]: not all trait items implemented, missing: `print_greeting`
  --> crates/wasi-common/src/snapshots/wasi_snapshot_preview1.rs:13:1
   |
13 |   impl<'a> WasiSnapshotPreview1 for WasiCtx {
   |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ missing `print_greeting` in implementation
   |
  ::: crates/wasi-common/src/wasi.rs:6:1
   |
6  | / wiggle::from_witx!({
7  | |     witx: ["WASI/phases/snapshot/witx/wasi_snapshot_preview1.witx"],
8  | |     ctx: WasiCtx,
9  | | });
   | |___- `print_greeting` from trait
```

This means there is a component that automatically generates Rust traits based on the snapshot `.witx` files - [the `wiggle`
crate][wiggle], used by `wasi-common` to generate the `WasiSnapshotPreview1` trait that needs to be implemented in `wasi_snapshot_preview1.rs`:

```
diff --git a/crates/wasi-common/src/snapshots/wasi_snapshot_preview1.rs b/crates/wasi-common/src/snapshots/wasi_snapshot_preview1.rs
index e4e4a604f..0fc1fa22f 100644
--- a/crates/wasi-common/src/snapshots/wasi_snapshot_preview1.rs
+++ b/crates/wasi-common/src/snapshots/wasi_snapshot_preview1.rs
@@ -1052,4 +1052,9 @@ impl<'a> WasiSnapshotPreview1 for WasiCtx {
     fn sock_shutdown(&self, _fd: types::Fd, _how: types::Sdflags) -> Result<()> {
         unimplemented!("sock_shutdown")
     }
+
+    fn print_greeting(&self) -> Result<()> {
+        println!("Hello World from the new print_greeting syscall in WASI");
+        Ok(())
+    }
 }
```

So we add a very simple implementation for our `print_greeting` function which prints to the console. Ultimately, we want this function
to get executed by the runtime when a WebAssembly module imports the `print_greeting` function from WASI.

If we now build the main repository, we should have a version of Wasmtime that contains the `print_greet` function in the
`wasi_snapshot_preview1` module.

### Using the `print_greet` function from a WebAssembly module

At this point, we can write a WebAssembly module that imports the `print_greeting` function and calls it:

```
(module
    (import "wasi_snapshot_preview1" "print_greeting" (func $print_greeting (result i32)))

    (memory 1)
    (export "memory" (memory 0))

    (func $main (export "_start")
        (call $print_greeting)
        return
    )
)
```

If we use our newly built Wasmtime binary and filter the logs, we can see the runtime executing our `print_greeting` function:

```console
RUST_LOG=wasi_common=trace ./target/debug/wasmtime examples/greeting.wat
TRACE wasi_common::wasi::wasi_snapshot_preview1

> print_greeting()
Hello World from the new print_greeting syscall in WASI

TRACE wasi_common::wasi::wasi_snapshot_preview1
> errno=No error occurred. System call completed successfully. (Errno::Success(0))
```

This isn't terribly useful, as our syscall does not take any arguments, and just prints a static message - but it shows how to potentially
add an implementation for very common operations that you might have in your runtime context, or extend existing runtimes.

As next steps, one could try adding more complicated logic for the system call, parameters and other return values, and potentially
building modules that use the newly added function from programming languages that compile to WASI (such as Rust, or C++). Hopefully, this
article gives you a starting point for getting started with WASI and Wasmtime.

[wasm]: https://webassembly.org
[mdn-concepts]: https://developer.mozilla.org/en-US/docs/WebAssembly/Concepts
[wasm-summit-videos]: https://www.youtube.com/watch?v=IBZFJzGnBoU&list=PL6ed-L7Ni0yQ1pCKkw1g3QeN2BQxXvCPK
[spec]: https://webassembly.github.io/spec/core/index.html
[wasm]: https://webassembly.org
[mdn-concepts]: https://developer.mozilla.org/en-US/docs/WebAssembly/Concepts
[wasm-summit-videos]: https://www.youtube.com/watch?v=IBZFJzGnBoU&list=PL6ed-L7Ni0yQ1pCKkw1g3QeN2BQxXvCPK
[spec]: https://webassembly.github.io/spec/core/index.html
[wasi-announcement]: https://hacks.mozilla.org/2019/03/standardizing-wasi-a-webassembly-system-interface/
[wasi-overview]: https://github.com/bytecodealliance/wasmtime/blob/master/docs/WASI-overview.md
[wasmtime-site]: https://wasmtime.dev/
[wasi-tutorial]: https://github.com/bytecodealliance/wasmtime/blob/master/docs/WASI-tutorial.md
[wasmsf]: https://www.meetup.com/wasmsf/events/265881345/
[josh]: https://twitter.com/josh_triplett
[jakub]: https://twitter.com/kubkon
[contributing]: https://bytecodealliance.github.io/wasmtime/contributing.html
[witx]: https://github.com/WebAssembly/WASI/blob/master/docs/witx.md
[wat]: https://webassembly.github.io/spec/core/bikeshed/index.html#text-format%E2%91%A0
[module-types]: https://github.com/WebAssembly/module-types/blob/master/proposals/module-types/Overview.md
[annotations]: https://github.com/WebAssembly/annotations/
[wasi-phases]: https://github.com/WebAssembly/WASI/tree/master/phases
[old]: https://github.com/WebAssembly/WASI/tree/master/phases/old
[snapshot]: https://github.com/WebAssembly/WASI/tree/master/phases/snapshot
[ephemeral]: https://github.com/WebAssembly/WASI/tree/master/phases/ephemeral
[vscode-wasm]: https://marketplace.visualstudio.com/items?itemName=dtsvet.vscode-wasm
[wiggle]: https://github.com/bytecodealliance/wasmtime/tree/master/crates/wiggle
[repo-revision]: https://github.com/bytecodealliance/wasmtime/tree/ac7cd4c46abdc9d4f3ef3230386afd52177e5f7c
