+++
author = "Radu Matei"
tags = ["rust", "golang"]
date = "2020-01-12"
title = "From (C)Go to Rust: A practical guide to building shared and static libraries, linking, and FFI"
description = "In this article we will explore how to build shared and static libraries in Go, and import them in Rust."
summary = "In this article we will explore how to build shared and static libraries in Go, and import them in Rust."
image = ""
+++

Rust is quickly becoming a popular language for systems programming, and [its public crate ecosystem][crates] contains packages for common tasks, such as HTTP servers, building command line interfaces, or JSON handling. But if you are coming from a different ecosystem, there might be specialized packages that do not have an equivalent yet. So what happens if you need to use such a package in your Rust project?

You have a couple of options:

- rewrite your package from scratch in Rust - if you have the resources, this might be the best option - however, this is obviously not always possible.
- building a _shared_ library and linking it in your Rust project - this has the advantage of not increasing the size of the Rust binary, but assumes you have a way of distributing the shared object (that is appropriate for the platform) on the target machine.
- building a _static_ library and linking it in your Rust project - this will increase the Rust binary, but once you compile it, you only need to distribute a single binary.

In this article we will explore how to build and link Go libraries in Rust projects, by taking a real world example - a library from the container ecosystem that only has a Go reference implementation, which we will use in a Rust project.

While CGO and FFI are not ideal (an absolute read before building projects with CGO is [this article by Dave Cheney][cheney-cgo]), they could provide a quick and dirty (and `unsafe`!) solution that could potentially unblock a project going forward.

You can [find the complete examples on GitHub][gh].

### The Go library

The library we are using as an example here is used to distribute WebAssembly modules with OCI registries, and it has a transitive dependency on [`containerd`][containerd], the popular container runtime, which means rewriting it in Rust is a non-trivial task.
We are not interested in specifically how this library is built in Go (it is built on top of [ORAS][oras], and you can [read more about building it in this article][wto]) - we are interested, however, in how this library is consumed in Go - it takes two `string` arguments, and returns a Go `error`.

```
err := oci.Pull("some-registry-reference", "output-file")
```

Now it's time to build a custom API that we want to expose to the library we will use through FFI - the [official Go documentation][cgo] offers a very good introduction to CGO, and discusses important scenarios you will encounter when exposing your library.

```
package main

import (
    "C"
    "fmt"

    "github.com/engineerd/wasm-to-oci/pkg/oci"
)

//export Pull
func Pull(ref, outFile string) int64 {
    err := oci.Pull(ref, outFile)
    if err != nil {
        fmt.Printf("cannot pull module: %v", err)
        return 1
    }

    return 0
}

func main() {}
```

A couple of notes:

- importing "C" ensures we will also get a C header file
- the `//export` comment is read by the compiler, and affects the name of the exported symbol for the function.
- if you return multiple values from an exported function, you will get an auto-generated C `struct` that contains the return values.
- you need to provide the dependencies used by your project in the same way as for any other Go project (either with a `vendor` directory, or with Go modules).
- you will use this API in a non-Go environment - so beware expecting or returning Go-specific objects (like channels, errors, or multiple return values) - unless you want potential consumers of the library to be left with void pointers defining Go objects:

```
typedef void *GoMap;
typedef void *GoChan;

// this is how a Go error is exposed
typedef struct { void *t; void *v; } GoInterface;
```

This is the reason why the function returns an `int64`, a fundamental data type, as opposed to a Go `error` - you lose the context an value of a Go `error`, but return a basic data type that has a correspondent in all other languages. Additionally, you can choose to return a `GoString` or a `C.String` as opposed to printing out the error on standard output.

### Building and linking a shared library in a Rust program

Now we can build the shared library. The extension is, by convention, `.dylib` in macOS, `.so` in Linux and `.dll` in Windows, and this operation will generate two files - the shared library and the C header:

```
$ CGO_ENABLED=1 go build -buildmode=c-shared -o shared/libwasm2oci.dylib shared/libwasm2oci.go
```

Now we can use [`rust-bindgen`][bindgen] to automatically generate Rust bindings from the C header:

```
$ bindgen shared/libwasm2oci.h -o src/ffi.rs
```

This generates a Rust source code file that declares the Go types used in the library as Rust types, together with layout tests:

```
pub type GoInt64 = ::std::os::raw::c_longlong;

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct _GoString_ {
    pub p: *const ::std::os::raw::c_char,
    pub n: isize,
}
```

At this point, we can utilize a very nice crate, [`libloading`][libloading], a _memory-safer wrapper around system dynamic library loading primitives_.

We can also use Rust's conditional compilation attribute `#[cfg(target_os)]` to select the appropriate shared library for the operating system where the crate is compiled (You might need to point this function to the absolute paths where the libraries can be found):

```
extern crate libloading as lib;

fn lib_file() -> String {
    #[cfg(target_os = "linux")]
    {
        String::from("shared/libwasm2oci.so")
    }
    #[cfg(target_os = "macos")]
    {
        String::from("shared/libwasm2oci.dylib")
    }
    #[cfg(target_os = "windows")]
    {
        String::from("shared/libwasm2oci.dll")
    }
}
```

Because the `Pull` function we exported accepted two Go `string` arguments, now we need to translate between a Rust `String` and a Go `string`. If you looked at `GoString`, it is made up of a list of characters and their length - which is how we transform each `String` argument our Rust function receives, then actually call the exported function from our shared library.

```
pub fn pull_wasm(reference: String, file: String) -> Result<(), OCIError> {
    let c_ref = CString::new(reference)?;
    let c_file = CString::new(file)?;

    let go_str_ref = GoString {
        p: c_ref.as_ptr(),
        n: c_ref.as_bytes().len() as isize,
    };
    let go_str_file = GoString {
        p: c_file.as_ptr(),
        n: c_file.as_bytes().len() as isize,
    };

    let lib = lib::Library::new(lib_file())?;
    unsafe {
        let func: lib::Symbol<unsafe extern "C" fn(r: GoString, f: GoString) -> i64> =
            lib.get(b"Pull")?;
        match func(go_str_ref, go_str_file) {
            0 => return Ok(()),
            _ => return Err(),
        }
    }
}
```

We transform the input into `GoString`, then use `libloading` to load the symbol for the `Pull` function, then execute the function associated with the symbol.

> [`libloading`][libloading] has a lot more useful features for loading dynamic libraries - make sure you check the [crate documentation][libloading].

Importing the module above in your program and using the `pull_wasm` function will execute the `Pull` function exported from our Go shared library - as long as the shared library can be found in the correct directory relative to where we're executing the program from.

If we want to not rely on the presence of a shared library in a specific directory on the target machine, we can make use of static linking.

### Building statically linked libraries

Using the same Go source code above, we can change the `-buildmode` to `c-archive`, and build a static library with the `.a` extension:

```
$ CGO_ENABLED=1 go build -buildmode=c-archive -o target/libwasm2oci.a lib/libwasm2oci.go
```

This also generates the C header, which can be used with [`rust-bindgen`][bindgen] to generate Rust bindings - again, the important function to note here is the `extern "C"` function that defines the symbol for our exported function from the Go static library:

```
extern "C" {
    pub fn Pull(p0: GoString, p1: GoString) -> GoInt64;
}
```

We can now call this function (provided we execute the same transformation from Rust strings to Go strings that we saw earlier) in an unsafe block:

```
let result = unsafe { Pull(go_str_ref, go_str_file) };
```

The only additional thing we need to do here is add a `build.rs` file that will instruct the Rust compiler to statically link the `.a` file we generated earlier:

```
fn main() {
    println!("cargo:rustc-link-search=native={}", "./target");
    println!("cargo:rustc-link-lib=static={}", "wasm2oci");
}
```

If you are trying to build a Darwin executable, and if your Go packages use any cryptography libraries, you might also have to link against the macOS core and security frameworks - add this conditional compilation expression to `build.rs` links them. (Depending on what your Go packages do, you might have to link other core libraries).

```
#[cfg(target_os = "macos")]
{
    println!("cargo:rustc-flags=-l framework=CoreFoundation -l framework=Security");
}
```

### Conclusion

In this article we explored building Go shared and static libraries that can be imported in Rust programs using foreign function interfaces. While not ideal, this could provide a very useful way of reusing a Go package in Rust. You can [find the complete examples on GitHub][gh].

If you are interested in this type of interoperability between programming languages, you could be interested in how [WebAssembly Interface Types][wit] might significantly simplify this type of scenario in a true cross-platform way once the specification is stabilized, and most compilers start offering support for interface types.

But until then, this is how you can link libraries in other languages and use them through FFI.

[crates]: https://crates.io/
[containerd]: https://github.com/containerd/containerd
[wto]: https://radu-matei.com/blog/wasm-to-oci/
[oras]: https://github.com/deislabs/oras
[cgo]: https://golang.org/cmd/cgo/
[so-mutiple-return-values]: https://stackoverflow.com/questions/49956986/how-to-write-interface-for-a-go-function-with-multi-return-values-with-jna
[cheney-cgo]: https://dave.cheney.net/2016/01/18/cgo-is-not-go
[libloading]: https://docs.rs/libloading/0.5.2/libloading/
[bindgen]: https://rust-lang.github.io/rust-bindgen/command-line-usage.html
[gh]: https://github.com/radu-matei/experiments/tree/master/rust
[wit]: https://hacks.mozilla.org/2019/08/webassembly-interface-types/
