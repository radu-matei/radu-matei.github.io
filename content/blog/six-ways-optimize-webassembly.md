---
title: "The Six Ways of Optimizing WebAssembly"
date: "2023-01-26T02:00:00Z"
tags: ["wasm"]

canonicalUrl: "https://www.infoq.com/articles/six-ways-optimize-webassembly"
---

_[This post is co-authored with Matt Butcher, and it originally appeared on InfoQ.com](https://www.infoq.com/articles/six-ways-optimize-webassembly)._

### Key Takeaways

* While many languages support Wasm, some are faster than others.
* Some compilers natively support optimizing Wasm for efficiency and speed.
* The wasm-opt tool can optimize a Wasm binary regardless of the original language it was used to create it.
* Using a JIT-enabled runtime can improve runtime performance depending on the hardware platform you are using.
* Some Wasm runtimes can even compile applications ahead-of-time (AOT) to reach native execution speed.
* The experimental Wizer project achieves a further performance boost by pre-initializing a Wasm binary to reduce the time it takes to launch it.
* In our practice, we saw good optimization can reduce Wasm binary size by a factor of ten.

WebAssembly (often abbreviated to Wasm) is a binary executable format. [Many different languages](https://github.com/fermyon/wasm-languages) can be executed via Wasm, including Rust, C, JavaScript, Python, Ruby, and the .NET languages.

Additionally, Wasm can run on a huge range of hardware and operating systems. The [specification](https://www.w3.org/TR/wasm-core-1/) is designed to be fast, compact, and above all secure.

In 2022, Wasm has cropped up in many different contexts. While it was originally designed for the browser, it turns out to be useful for embedded programming, plugins, cloud, and edge computing.

One thing these different use cases have in common is that performance is tremendously important. Since loading an executable quickly is part of performance, file size often has a direct impact on raw performance.

In this article, we’ll look at six ways to optimize Wasm for performance and file size.

### Language Choice

Each programming language has its own nuances, and one of those is how large a runtime the language requires in order to execute. On the lightweight side, low-level system languages like C and Rust require small runtime overhead.

Other compiled languages like Swift bring a hefty runtime along for the ride. A Swift binary may be substantially larger simply because it includes a lot of built-in behavior. Java and .NET also tend to bring larger binary sizes for a similar reason.

To illustrate, let’s take a look at a “hello world” program in Rust and in Swift.

In Rust, a basic “hello world” program looks like this:

```
fn main() {
    println!("Hello, world!");
}
```

Compiled with `cargo build —target wasm32-wasi`, this binary is 2.0M. (This is an unoptimized binary. We’ll return to this file size later.)

Here’s a similar program in Swift: 

```
print("Hello, World!\\n")
```

Compiling this to Wasm  with the [Swiftwasm](https://swiftwasm.org/) project using the command `swiftc -target wasm32-unknown-wasi hello.swift -o hello.wasm` produces a 9.1M image. That makes the Swift version over 4x larger than the equivalent Rust version.

So which language you choose will impact the file sizes of your binaries as well as the startup time  (at least to some degree). This is not the final word on file sizes, though. There are ways to optimize the binary sizes further.

### Using Compiler Flags to Optimize

Some compilers offer built-in compiler flags that can optimize the binaries they produce. Long-time C and C++ users are accustomed to this. And new languages like Rust and Zig also provide optimization options.

In the previous section, we looked at a simple three-line Rust program. When we compiled it with the default `cargocommand`, it produced a 2.0M binary. But by adding another flag, we can trim that size down: `cargo build --target wasm32-wasi --release`. This produces a 1.9M binary. On a small program like this, and with Rust’s svelte runtime, not much can be shaved off. On bigger projects, though, the --release flag can drastically reduce the file size. For example, compiling the [Bartholomew CMS](https://bartholomew.fermyon.dev/) without the release flag yields an 84M binary, while using the release flag reduces it to 7M. That’s a huge savings. 

Rust’s release target does more than merely reduce the file size. It can also speed up execution because it removes symbols that are used by debuggers and analysis tools. This is almost always a worthwhile feature when you are running code in production. Launching the full 84M version of Bartholomew may take up to a second to execute, but that reduces to a mere couple milliseconds when using the optimized version.

### Optimizing Size with `wasm-opt`

In the above section, we saw how some compilers provide optimization flags. But not all of them do. Furthermore, even compilers that can produce some optimizations might not aggressively optimize.

Wasm optimization tools can perform robust analysis of a Wasm binary and further optimize the file size and even the performance characteristics of a Wasm executable. The [Binaryen](http://webassembly.github.io/binaryen/) project provides a number of command line tools for working with Wasm, including the wasm-opt optimizer.

Before, we looked at a Swift program that was 9.1M in size.  Let’s take a look at what happens when we run wasm-opt `-O hello.wasm -o hello-optimized.wasm`. This command will produce an optimized binary named `hello-optimized.wasm`. The resulting size is 4.0M, a reduction of over 50%.

The wasm-opt tool performs dozens of optimizations on a binary, ranging from removing duplicate code to re-organizing the code. Code, here, means the Wasm instructions, not the source code you edit. So running wasm-opt won’t change the source Swift code. It just rewrites the Wasm binary. While optimizing this way definitely cuts down the file size, it also improves runtime performance. On my system, the optimized “hello world” program executed twice as fast as the unoptimized one.

Indeed, wasm-opt can even further optimize the already-optimized Rust code. Running it on the 1.9M Rust binary from the previous section generates an even more compact 1.6M binary. In such a simple case performance did not improve. Both run in a tenth of a second. But larger Rust binaries likely also gain speed improvements with `wasm-opt`.

### The Runtime Matters

Wasm is a flexible binary format. It can be executed by an interpreter such as [wasm3](https://github.com/wasm3/wasm3), which will read and execute small chunks of the code in sequence. But other Wasm runtimes like [Wasmtime](https://wasmtime.dev/) use a technology called JIT (Just-In-Time) compiling to speed up execution.

For small programs, like our “hello world” examples, or on devices with constrained resources such as a Raspberry Pi, an interpreter is often desirable since it does the least amount of work and uses the fewest resources.

But for larger programs like the Bartholomew CMS, a JIT-style runtime will outperform an interpreter. The reason for this discrepancy is that a JIT compiler does extra work at startup and during early execution in order to optimize the in-memory representation of the program. And this optimization shows up as the code continues to run. Because the JIT process takes time, though, this can appear to be a performance penalty for small programs that only run for a moment.

How do you choose? The traditional rule of thumb is this: If you are running on a constrained device smaller than a Raspberry Pi, use an interpreter. Otherwise, favor a JIT-enabled runtime.

When it comes to runtimes, there’s one more trick.

### Ahead-Of-Time (AOT) Compiling

A JIT runtime performs in-memory optimizations at startup time. But what if we could perform optimizations once, write those optimizations back out to disk, and then take advantage of those optimizations the next time the program is run? This strategy is called Ahead-Of-Time (AOT) compiling.

There’s a big drawback to AOT compiling: the optimizations done during this stage are different-in-kind than the ones we saw earlier with wasm-opt. With AOT, optimizations are machine-specific. These optimizations take into account operating system and processor architecture, which means once we perform these optimizations, our Wasm binary is no longer portable. Furthermore, each runtime has its own format for these optimizations, so a program AOT-compiled with one Wasm runtime will no longer be runnable by other Wasm runtimes.

The Wasmtime runtime can compile a Wasm module to an AOT format. For example, we can run `wasmtime compile hello.wasm` to compile our Swift example. This will produce a new file named `hello.cwasm` that can be executed by Wasmtime.

Again, for trivial programs like our “hello world” example, AOT compiling will not have a large benefit. But when working with non-trivial programs, AOT compiling will achieve higher performance numbers than either interpreter or JIT-enabled runs. Note, however, that most AOT compilers produce binaries that may be larger than their Wasm equivalent because many elements of the Wasm runtime itself are compiled into the binary to improve performance.

There is a very specific rule of thumb for knowing when to use an AOT compiler for Wasm: only use it when you know that the program will only ever be run with exactly the same configuration of Wasm runtime, operating system, and architecture. Wasm modules should be distributed in their normal Wasm form, and only AOT-compiled at or after the installation step.

### Pre-Initializing a Binary

The fifth and final optimization technique is the most peculiar of the lot. Wasm is a stack-based virtual machine, and at any given time it can be stopped and even written out to disk, to be resumed later. (There are a few limitations to this, but these limitations are not important here.) This feature of Wasm has an interesting application.

Sometimes there are parts of your code that you need to run every single time on startup. This code may do banal things like setting the default value of a variable or creating an instance of a data structure. Every time the code is run, this same bit of initialization logic must be performed. And with each run, the resulting state of the program is the same. The variable is initialized to the same value, or the data structure is initialized into the same state.

What if there was a way to run that first initialization, then freeze the Wasm state and write it back out to disk? Then the next time the program is executed, it wouldn’t have to run the initialization step. That would already be done!

This is the idea behind the [Wizer](https://github.com/bytecodealliance/wizer) project. Wizer provides a way to annotate your code with initialization blocks that can then be executed once and then written out to a new post-initialization Wasm binary. Unlike AOT compiling, the resulting binary is still a plain old Wasm binary, so this technique is portable.

Wizer can be a little finicky to use. But systems like .NET can benefit greatly from Wizer.

### Bringing It All Together

Based on our experience at Fermyon, optimization is important for both developer tools and Cloud runtime, but the two cases differ substantially.

On the developer side, the best practice is to use as many optimization tools as your compiler gives you. For example, we always use the `—release` flag when compiling our Rust code. Our open source [Spin](https://github.com/fermyon/spin) tool, which allows developers to build WebAssembly microservices and web applications using several languages, includes these optimizations in per-language templates. We have also found including wasm-opt in the local compile pass to be useful, especially with languages that have a large runtime.

During the development process, we use a JIT-enabled runtime. There is little value in AOT compiling during the development phase.

The server side is different. For example, our SaaS-based Wasm runtime platform, Fermyon Cloud, only accepts Wasm binaries, but when it deploys them to the cloud cluster, those binaries are AOT-compiled. This is possible in a reliable way because that is the moment we know exactly what the host runtime’s configuration is. If the Wasm file is deployed to an Arm64 system, it can be AOT-compiled accordingly, without the concern that it will be executed on an Intel architecture.

When it comes to Wizer, we really only use it in the [case of .NET](https://www.fermyon.com/blog/webassembly-for-dotnet-developers-spin-sdk-intro), which benefits tremendously from this optimization.

### Conclusion

We’ve picked our way through six different ways of optimizing Wasm for performance and for file size. Each method has pros and cons, and many of these methods can be combined for added benefit. Employing these techniques for production Wasm environments can be beneficial.
