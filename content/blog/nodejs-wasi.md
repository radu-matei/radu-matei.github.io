---
title: "Getting started with NodeJS and the WebAssembly System Interface"
description:
  "NodeJS recently added experimental support for executing WebAssembly modules
  using WASI, or the WebAssembly System Interface. In this article we explore
  how to get started with the WASI sandbox and writing various modules we can
  execute, in Rust, or AssemblyScript."
summary:
  "NodeJS recently added experimental support for executing WebAssembly modules
  using WASI, or the WebAssembly System Interface. In this article we explore
  how to get started with the WASI sandbox and writing various modules we can
  execute, in Rust, or AssemblyScript."
date: 2020-07-19 00:00:00 +0000 UTC
author: "Radu Matei"
tags: ["wasm"]
images: ["/img/article-photos/node-wasi/node-wasi-cover.png"]
image: "/img/article-photos/node-wasi/node-wasi-cover.png"
---

![](/img/article-photos/node-wasi/node-wasi-cover.png)

[WASI, the WebAssembly System Interface,][wasi-dev] is a capability-oriented set
of APIs designed to standardize the sandboxed execution of WebAssembly modules
outside of browsers. Specifically, WASI aims to be the common layer that
WebAssembly modules can use to interface with host runtimes, and get granular
access to OS specific objects (such as files, environment variables, or
sockets). For an introduction to the goals and architecture of WASI, head over
to the Mozilla blog and read [Lin Clark's announcement post][wasi-announcement].

[Node.js][nodejs] has [recently][initial-commit] added [experimental
support][nodejs-wasi] for WASI. This means that if you are running a recent
version of Node.js, you can natively start a WASI instance and execute
WebAssembly modules in a sandboxed environment, and granularly pass environment
variables, arguments, or file handles to the process running in the module, and
in this article we will briefly explore how to get started, and execute WASI
modules written in Rust and AssemblyScript.

All examples in this article can be found in [this repository on
GitHub][examples-repo].

Let's start by running the example in the [official documentation][nodejs-wasi].
The module there is written in the WebAssembly Text Format (and is in fact [the
same example from the Wasmtime documentation][wasmtime-example-wat]).

> Mozilla Developer Network has an excellent set of articles dedicated to
> [understanding the Wasm text format][mdn-wat], as well as describing in detail
> how to [convert between the text and binary formats][mdn-wat2wasm] using the
> [WebAssembly binary toolkit][wabt].

```
(module
    ;; Import the required fd_write WASI function which will write the given io vectors to stdout
    ;; The function signature for fd_write is:
    ;; (File Descriptor, *iovs, iovs_len, nwritten) -> Returns number of bytes written
    (import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))

    (memory 1)
    (export "memory" (memory 0))

    ;; Write 'hello world\n' to memory at an offset of 8 bytes
    ;; Note the trailing newline which is required for the text to appear
    (data (i32.const 8) "hello world\n")

    (func $main (export "_start")
        ;; Creating a new io vector within linear memory
        (i32.store (i32.const 0) (i32.const 8))  ;; iov.iov_base - This is a pointer to the start of the 'hello world\n' string
        (i32.store (i32.const 4) (i32.const 12))  ;; iov.iov_len - The length of the 'hello world\n' string

        (call $fd_write
            (i32.const 1) ;; file_descriptor - 1 for stdout
            (i32.const 0) ;; *iovs - The pointer to the iov array, which is stored at memory location 0
            (i32.const 1) ;; iovs_len - We're printing 1 string stored in an iov - so one.
            (i32.const 20) ;; nwritten - A place in memory to store the number of bytes written
        )
        drop ;; Discard the number of bytes written from the top of the stack
    )
)
```

This hand-written module imports [`fd_write`][fd_write] from
`wasi_snapshot_preview1`, a function exposed by WASI used for writing to a
provided file descriptor, which is used later to write `"hello world"` to
standard output. We can convert it to its binary format using
[`wat2wasm`][wabt], from the WebAssembly binary toolkit, and we can now
instantiate it in WASI:

```
"use strict";
const fs = require("fs");
const { WASI } = require("wasi");
const wasi = new WASI();
const importObject = { wasi_snapshot_preview1: wasi.wasiImport };

(async () => {
  const wasm = await WebAssembly.compile(
    fs.readFileSync("./examples/wat/hello.wasm")
  );
  const instance = await WebAssembly.instantiate(wasm, importObject);

  wasi.start(instance);
})();
```

We are creating a new instance of `WASI`, and we pass the
`wasi_snapshot_preview1` import as the native Node implementation of the WASI
`libc`. Then, using Node 14.5 and running with the experimental flags enabled,
we can execute the file above and get the expected output:

```
$ node --version
v14.5.0
$ node --experimental-wasi-unstable-preview1 --experimental-wasm-bigint wasi.js

hello world
```

> V8 uses a custom WASI [`libc` implementation][uvwasi] based on `libuv`, and
> [the `fd_write` system call][uvwasi_fd_write] is [implemented by
> V8][v8-fd_write], which exposes a small public API for interacting with WASI
> in JavaScript.

> If you are interested in the stability of the WASI imports, check the
> different [phases here][wasi-phases].

But we don't usually execute system calls just to open a file, or write
something to the console - we use higher level programming languages that
abstract that through their standard libraries. Let's see how we could achieve
the same thing in other programming languages.

### Rust and WASI

To start, you need to [install the Rust toolchain on your machine][rustup] and
create the default `cargo new` project:

```
fn main() {
    println!("Hello, world from Rust!");
}
```

Then add the `wasm32-wasi` compiler target and compile the project to WASI:

```
$ rustup target add wasm32-wasi
$ cargo build --target wasm32-wasi
```

If we change the path of the module to the one generated by the Rust compiler
(`target/wasm32-wasi/debug/<your-app-name>.wasm`) and run again:

```
$ node --experimental-wasi-unstable-preview1 --experimental-wasm-bigint wasi.js
Hello, world from Rust!
```

In both examples, we granted the modules the ability to write to standard output
by linking the functionality implemented by the runtime in
`wasi_snapshot_preview1`. If we don't provide the WASI import - not add the
`wasi_snapshot_preview1` import:

```
const importObject = {};
```

Then the module cannot print to standard output:

```
node --experimental-wasi-unstable-preview1 --experimental-wasm-bigint wasi.js
(node:30775) UnhandledPromiseRejectionWarning:
TypeError: WebAssembly.instantiate(): Import #0 module="wasi_snapshot_preview1" error: module is not an object or function
    at nodejs-wasi-examples/wasi.js:14:38
```

Ok, now let's see how we can grant access to files and directories. Consider the
following Rust program:

```
use std::fs;

fn main() {
    let contents =
        fs::read_to_string("/sandbox/file.txt").expect("Something went wrong reading the file");
    println!("Content: {}", contents);
}
```

It tries to read the content of the file from `/sandbox/file.txt` - but by
default, the WASI process does not have access to the file system:

```
thread 'main' panicked at
 'Something went wrong reading the file: Custom { kind: Other, error: "failed to find a preopened file descriptor through which \"/sandbox/file.txt\" could be opened" }', src/main.rs:6:9
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
(node:33051) UnhandledPromiseRejectionWarning: RuntimeError: unreachable
    at __rust_start_panic (<anonymous>:wasm-function[218]:0x9f29)
    at rust_panic (<anonymous>:wasm-function[212]:0x99a2)
```

We have to explicitly provide a directory mapping for the directories we want to
allow access to - in this case the current directory.

```
const wasi = new WASI({
  preopens: {
    "/sandbox": process.cwd(),
  },
});
```

And now it can read the file:

```
node --experimental-wasi-unstable-preview1 --experimental-wasm-bigint wasi.js
Content:
This is a file on disk mounted inside the sandboxed process at /sandbox.
It can be read, modified, or even deleted by the process running inside the module.
```

> This is a very simple scenario, where the module always tries to open the file
> from `/sandbox/file.txt` - but this can also work by passing the file path as
> an argument to the WASI process, and the sandbox always make sure the process
> actually has access to the specified file.

### AssemblyScript and WASI

[AssemblyScript][as] is a strict variant of TypeScript which is natively
compiled to WebAssembly. (as opposed to TypeScript, which is transpiled to
JavaScript). This means that users can easily create modules by writing a
familiar language. Note, however, that most likely you will not be able to
simply compile your favorite TypeScript library to WebAssembly, as it probably
makes use of either browser or NodeJS features, which will not be available in
the WebAssembly runtime without the necessary module imports. For a list of the
basic functionality and limitations of AssemblyScript, check out [the official
documentation][as-basics].

AssemblyScript doesn't have native WASI support just yet - this is why we are
going to use a library that offers the API layer for WASI syscalls -
[`as-wasi`][as-wasi]. Basically, this creates a few high-level AssemblyScript
objects to interact with WASI (for getting environment variables, or writing to
files), and implements the translation layer that compiles to WebAssembly,
allowing us to write AssemblyScript modules that can be then run in any WASI
runtime.

Let's see how a small AssemblyScript program that prints its arguments and the
environment variables looks like.

First, we need the two dependencies - AssemblyScript itself, and `as-wasi`, and
a small script that calls the AssemblyScript compiler:

```
{
    "scripts": {
        "asbuild": "asc index.ts -b build/as-wasi-example.wasm --use abort=wasi_abort"
    },
    "dependencies": {
        "as-wasi": "0.0.1",
        "assemblyscript": "^0.14.0"
    }
}
```

> The `--use abort=wasi_abort` flag is used to explicitly bind the
> AssemblyScript `abort` function to the one provided by the runtime. There are
> [ways to avoid having to use it][import-wasi], but for the purpose of this
> example, it is easier to just use it.

> `0.0.1` is not the [latest version][as-wasi-releases] for `as-wasi` - however,
> there is a bug in newer versions that results in an allocation error when
> trying to use environment variables and command line arguments. A
> [fix][alloc-fix] for the bug has already been merged, but until there is a new
> release, we can use version `0.0.1`.

We read both environment variables and command line arguments and print them to
standard output. Notice that the objects used are imported from `as-wasi`, and
are different from the native NodeJS objects:

```
import { Console, Environ, CommandLine } from "as-wasi";

export function _start(): void {
  let env = new Environ();
  let all_vars = env.all();
  all_vars.forEach(function (val) {
    Console.log(val.key + "=" + val.value);
  });

  let cmd = new CommandLine();
  Console.log("args: " + cmd.all().toString());
}
```

Now we can install the dependencies and build the module:

```
$ npm install
$ npm run-script asbuild
```

Running this example is similar - notice, however, the different arguments and
environment variables:

```
const wasi = new WASI({
  args: ["arg1", "arg2"],
  env: {
    abc: "def",
    foo: "bar",
  },
});
const importObject = { wasi_snapshot_preview1: wasi.wasiImport };

(async () => {
  const wasm = await WebAssembly.compile(
    fs.readFileSync(
      "./examples/assemblyscript-wasi/build/as-wasi-example.wasm"
    )
  );
  const instance = await WebAssembly.instantiate(wasm, importObject);

  wasi.start(instance);
})();

```

The `args`, `env`, and `preopen` objects from the WASI options can be used to
granularly control the environment of the process running in the sandbox, and in
this case, we are passing a set of new environment variables and arguments
(although a subset of the real `process.env` and `process.args` can be passed
instead, as needed):

```
$ node --experimental-wasi-unstable-preview1 --experimental-wasm-bigint wasi.js
abc=def
foo=bar
Args are: arg1,arg2
```

> Another programming language with native support for WASI is Zig - you can
> watch a [live coding session by Jakub Konka exemplifying how to write Zig that
> compiles to WASI.][zig-wasi]

### Conclusion

In this article we took a first look at running WebAssembly modules using the
early native support in NodeJS for WASI, and explored writing WASI modules in
Rust and AssemblyScript. While WASI support is still early in most environments,
it is rapidly becoming a great way of running sandboxed and portable code across
runtimes and operating systems.

[wasi-dev]: https://wasi.dev
[wasi-announcement]:
  https://hacks.mozilla.org/2019/03/standardizing-wasi-a-webassembly-system-interface/
[nodejs-wasi]: https://nodejs.org/api/wasi.html
[nodejs]: https://nodejs.org/en/
[initial-commit]:
  https://github.com/nodejs/node/commit/09b1228c3a2723c6ecb768b40a507688015a478f
[interface-types-articles]: https://radu-matei.com/blog/wasm-api-witx/
[wasmtime-syscall]: https://radu-matei.com/blog/adding-wasi-syscall/
[wasi-spec]: https://github.com/webassembly/wasi
[wasm-cg]: https://www.w3.org/community/webassembly/
[mdn-wat]:
  https://developer.mozilla.org/en-US/docs/WebAssembly/Understanding_the_text_format
[mdn-wat2wasm]:
  https://developer.mozilla.org/en-US/docs/WebAssembly/Text_format_to_wasm
[wabt]: https://github.com/webassembly/wabt
[wasmtime-example-wat]:
  https://github.com/bytecodealliance/wasmtime/blob/master/docs/WASI-tutorial.md
[fd_write]:
  https://github.com/WebAssembly/WASI/blob/master/phases/snapshot/docs.md#-fd_writefd-fd-iovs-ciovec_array---errno-size
[v8-fd_write]:
  https://github.com/nodejs/node/blob/ac6ecd6b7f5949950d600de21488440f9f98c961/src/node_wasi.cc#L969-L1017
[uvwasi_fd_write]:
  https://github.com/nodejs/node/blob/0c81cadec6aa92985819a76827f28cfe8e656a8e/deps/uvwasi/src/uvwasi.c#L1397-L1441
[uvwasi_header]:
  https://github.com/nodejs/node/blob/master/deps/uvwasi/include/uvwasi.h#L173-L177
[uvwasi]: https://github.com/cjihrig/uvwasi
[rustup]: https://www.rust-lang.org/learn/get-started
[as]: https://www.assemblyscript.org/
[examples-repo]: https://github.com/radu-matei/node-wasi-examples
[wasi-phases]: https://github.com/WebAssembly/WASI/tree/master/phases
[as-basics]: https://www.assemblyscript.org/basics.html
[as-wasi]: https://github.com/jedisct1/as-wasi
[import-wasi]: https://github.com/AssemblyScript/assemblyscript/pull/1159
[as-wasi-releases]: https://github.com/jedisct1/as-wasi/releases
[alloc-fix]: https://github.com/jedisct1/as-wasi/pull/54
[zig-wasi]: https://www.youtube.com/watch?v=g_Degmqfo4Q
[rust-wasm]: https://rustwasm.github.io/book/
