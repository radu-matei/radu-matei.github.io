---
title: "Writing a simple WASM API layer using interface types and Wasmtime"
description:
  "In this short article we explore how to get started with WebAssembly
  interface types by defining a simple API layer, then implementing that using
  Wiggle and Wasmtime"
summary:
  "In this short article we explore how to get started with WebAssembly
  interface types by defining a simple API layer, then implementing that using
  Wiggle and Wasmtime"
date: 2020-06-17 00:00:00 +0000 UTC
author: "Radu Matei"
tags: ["wasm", "rust"]
image: ""
---

[The WebAssembly interface types proposal][interface-types-explainer] aims to
add a new common set of interface types to the core specification that would
describe abstract, higher level values, and the ability to adapt the interface
of a module so that different hosts can inter-operate using the higher level
types. For a comprehensive explainer of the problems interface types are
supposed to solve, [Lin Clark][lin] has an [excellent article on the Mozilla
Hacks blog][interface-types-article], with a demo of using the same markdown
renderer compiled to WebAssembly, and using native strings from languages like
Rust, Python, or JavaScript:

{{< youtube Qn_4F3foB3Q >}}

The goal is for compiler toolchains to automatically generate interface types
when compiling a module, as well as to read interface types and adapt the types
needed in the module to the types used by the host. For the purpose of this
article, however, you can think of an interface type as a regular interface or
[trait][trait]: it _defines shared behavior in an abstract way_, without
providing an actual implementation for how to achieve that behavior.

In this article, we will manually write an interface type for a simple
calculator module, then use Wasmtime tooling to _correctly_ implement that
interface type in Rust, link our implementation, and use it in a module that
requires a calculator library. The examples used will be purposefully simple,
and the goal is to show how to currently use this set of tools.

You can find [the complete project on GitHub][repo].

### Writing a simple interface type in WITX

The current proposal describes interface types using [`WITX`][witx], an
experimental file format based on the [WebAssembly Text Format][wat], with added
support for [module types][module-types] and [annotations][annotations]. It is
how the [WASI][wasi-doc] API is defined, and if you are familiar with `.wat`
files, `.witx` should seem familiar.

The goal is to have a calculator module with a single function that adds two
numbers. Let's describe this using WITX:

```
(use "errno.witx")

;;; Add two integers
(module $calculator
  (@interface func (export "add")
    (param $lh s32)
    (param $rh s32)
    (result $error $errno)
    (result $res s32)
  )
)
```

> `errno.witx` is another WITX file that describes a custom, user-defined error
> type returned from the function. You can find its definition in the repository
> [here][errno].

The WITX file defines a `calculator` module with a single function, `add`, which
takes two 32-bit signed integers and returns a 32-bit signed integer, or an
error. Now we can use [`wiggle`][wiggle], a Rust crate that generates Rust code
based on interface types definitions, and get a strongly-typed Rust trait based
on the WITX file above:

```
wiggle::from_witx!({
    witx: ["examples/calculator.witx"],
    ctx: CalculatorCtx,
});

pub struct CalculatorCtx {}
```

According to the [`wiggle` documentation][from_witx], the `from_witx` macro
takes a WITX file and generates a set of public Rust modules based on the
interface type definition. Specifically, it generates a `types` module that
contains all user-defined types, and one module for each WITX `module` defined
that contains Rust traits that have to be implemented by the structure passed as
"context".

This means there is now a `Calculator` trait with a single `add` method that our
`CalculatorCtx` structure has to satisfy:

```
  ::: src/calculator.rs:6:1
   |
6  | pub struct CalculatorCtx {}
   | ------------------------ method `add` not found for this
   |
   = help: items from traits can only be used if the trait is implemented and in scope
   = note: the following traits define an item `add`, perhaps you need to implement one of them:
           candidate #1: `calculator::calculator::Calculator`
           candidate #2: `std::ops::Add`

error[E0277]: the trait bound `calculator::CalculatorCtx: calculator::calculator::Calculator` is not satisfied
 --> src/calculator.rs:1:1
  |
1 |   wiggle::from_witx!({
  |   ^------------------
  |   |
  |  _required by `calculator::calculator::Calculator::add`
  | |
2 | |     witx: ["examples/calculator.witx"],
3 | |     ctx: CalculatorCtx,
4 | | });
  | |___^ the trait `calculator::calculator::Calculator` is not implemented for `calculator::CalculatorCtx`

calculator.rs(12, 1): implement the missing item:
fn add(&self, _: i32, _: i32) -> std::result::Result<i32, calculator::types::Errno> { todo!() }
```

We implement the `add` method, and at this point, `CalculatorCtx` can be used as
our implementation for the calculator interface.

```
impl calculator::Calculator for CalculatorCtx {
    fn add(&self, lh: i32, rh: i32) -> Result<i32, types::Errno> {
        Ok(lh + rh)
    }
}
```

The interface type definition for the `add` method uses `s32`, or signed
integers. However, `s32` is not a fundamental WebAssembly data type (quick
reminder that [the fundamental data types in WebAssembly are:
`𝗂𝟥𝟤 | 𝗂𝟨𝟦 | 𝖿𝟥𝟤 | 𝖿𝟨𝟦`][types]). This is where the [interface types
proposal][wit-int] defines the additional integer data types:

> In addition to `string`, the proposal includes the integer types `u8`, `s8`,
> `u16`, `s16`, `u32`, `s32`, `u64`, and `s64`. [...] Since values of these
> types are proper integers, not bit sequences like core wasm `i32` and `i64`
> values, there is no additional information needed to interpret their value as
> a number.

The trait generated by `wiggle` maps the signed 32-bit integer from the
interface types proposal to [the Rust _signed_ integer, `i32`][rust-i32] (not to
be confused with the WebAssembly `i32` data type, which is _not inherently
signed or unsigned, [its] interpretation is determined by individual
operations_). Before actually instantiating the module that will use this
implementation, the Rust `i32` will be mapped to the WebAssembly `i32` data
type.

### Using Wasmtime to link the calculator library

Now that we have an actual implementation that we know satisfies the interface
defined in the WITX file, we can use it to instantiate a module that imports
that functionality:

```
(module
  (import "calculator" "add" (func $calc_add (param i32 i32) (result i32)))

  (func $add (param $lhs i32) (param $rhs i32) (result i32)
    local.get $lhs
    local.get $rhs
    call $calc_add)
  (export "add" (func $add))
)
```

There is nothing special about the WAT file above: it defines an import for an
`add` function that takes two `i32` parameters and returns an `i32`. (Note the
parameters are fundamental WebAssembly types). Then, we call this function later
in our module's implementation.

In order to successfully instantiate the module above, we need to satisfy its
imports. This is where our implementation becomes useful - we can use the
[Wasmtime linker][linker] to define the implementation for the `add` function
required by the module by creating an instance of the `CalculatorCtx` structure
defined earlier, and returning the result of its `add` method.

```
let mut linker = Linker::new(store);
linker.func("calculator", "add", |x: i32, y: i32| {
    let ctx = calculator::CalculatorCtx {};
    ctx.add(x, y).unwrap()
})?;

linker.instantiate(&module)
```

Building the project and executing our `.wat` file, we see that our `add`
implementation is properly linked and our module correctly instantiated:

```
$ ./target/debug/wasm-calc examples/using_add.wat add 1 2
3
```

You can find the complete implementation for instantiating the module [on
GitHub][main].

### Conclusion

The big advantage here is that if either the interface type definition, or the
implementation changes, we get a Rust compiler error because the
`calculator::Calculator` trait is no longer satisfied by `CalculatorCtx`,
ensuring that the interface and implementation are always in sync.

This doesn't mean, however, that the experience cannot be improved - for example
determining if an interface type definition satisfies the imports for
instantiating a given module, compiler support for generating interface types,
or automatically linking all the exports required by a module given a list of
dependent modules (the [`wig` crate][wig] does something similar for WASI
imports).

The interface types proposal is still in early stages, but even in its current
state - but if you are interested in language interoperability and sandboxing,
these are incredibly exciting times.

[interface-types-article]:
  https://hacks.mozilla.org/2019/08/webassembly-interface-types/
[interface-types-explainer]:
  https://github.com/WebAssembly/interface-types/blob/master/proposals/interface-types/Explainer.md
[wasmtime]: https://github.com/bytecodealliance/wasmtime/
[lin]: https://twitter.com/linclark
[trait]: https://doc.rust-lang.org/book/ch10-02-traits.html
[witx]: https://github.com/WebAssembly/WASI/blob/master/docs/witx.md
[wat]:
  https://webassembly.github.io/spec/core/bikeshed/index.html#text-format%E2%91%A0
[module-types]:
  https://github.com/WebAssembly/module-linking/blob/master/proposals/module-linking/Explainer.md
[annotations]: https://github.com/WebAssembly/annotations/
[wasi-doc]:
  https://github.com/WebAssembly/WASI/blob/master/phases/ephemeral/docs.md
[errno]: https://github.com/radu-matei/wasm-calc/blob/master/examples/errno.witx
[repo]: https://github.com/radu-matei/wasm-calc
[wiggle]: https://docs.rs/wiggle/0.18.0/wiggle/
[i32-u32]: https://github.com/WebAssembly/interface-types/issues/86
[from_witx]: https://docs.rs/wiggle/0.18.0/wiggle/macro.from_witx.html
[types]: https://webassembly.github.io/spec/core/syntax/types.html
[wit-int]:
  https://github.com/WebAssembly/interface-types/blob/master/proposals/interface-types/Explainer.md#integers
[rust-i32]: https://doc.rust-lang.org/std/primitive.i32.html
[linker]: https://docs.rs/wasmtime/0.18.0/wasmtime/struct.Linker.html
[wig]: https://docs.rs/wig/0.18.0/wig/index.html
[main]: https://github.com/radu-matei/wasm-calc/blob/master/src/main.rs
