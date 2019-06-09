(window.webpackJsonp=window.webpackJsonp||[]).push([[11],{38:function(e){e.exports={docs:{quickstart:{id:"quickstart",title:"Quickstart",description:"## Installation",source:"/Users/brian/Projects/channel/website/docs/01_quickstart.md",permalink:"/docs/quickstart",sidebar:"docs",category:"Getting Started",next:"overview",next_title:"Overview"},overview:{id:"overview",title:"Overview",description:"*NOTE: These docs assumes some familiarity with recent javascript features, specifically [promises](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises), [async/await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await) and [iterators/generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators). If you are unfamiliar with these features, what follows might not make much sense.*",source:"/Users/brian/Projects/channel/website/docs/02_overview.md",permalink:"/docs/overview",sidebar:"docs",category:"Getting Started",next:"rationale",previous:"quickstart",previous_title:"Quickstart",next_title:"Rationale"},rationale:{id:"rationale",title:"Rationale",description:"While [async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern javascript runtimes, they have yet to achieve widespread usage due to various perceived [flaws](https://github.com/apollographql/graphql-subscriptions/issues/116) and [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126). What’s needed is something like the `Promise` constructor, which helped promises succeed by providing a common pattern for converting callback-based APIs into promises. The `Channel` constructor makes it easy to turn *any* callback-based source of data into an async iterator, and prevents common async iterator mistakes [by design](safety). The constructor pattern is easy to memorize and adaptable for almost every async iterator use case.",source:"/Users/brian/Projects/channel/website/docs/03_rationale.md",permalink:"/docs/rationale",sidebar:"docs",category:"Getting Started",next:"combinators",previous:"overview",previous_title:"Overview",next_title:"Combining Async Iterators"},combinators:{id:"combinators",title:"Combining Async Iterators",description:"Combining async iterators is a [non-trivial task](https://stackoverflow.com/questions/50585456/how-can-i-interleave-merge-async-iterables), and the `Channel` class defines four static methods similar to `Promise.race` and `Promise.all` which allow you to combine async iterators in different ways. These methods can be used to write applications in the [reactive programming](https://en.wikipedia.org/wiki/Reactive_programming) paradigm.",source:"/Users/brian/Projects/channel/website/docs/04_combinators.md",permalink:"/docs/combinators",sidebar:"docs",category:"Guides",next:"safety",previous:"rationale",previous_title:"Rationale",next_title:"How are Channels “Safe”?"},safety:{id:"safety",title:"How are Channels “Safe”?",description:"Most async iterator libraries currently available are prone to causing memory leaks through normal usage. Channels use the following design principles to prevent leaks:",source:"/Users/brian/Projects/channel/website/docs/05_safety.md",permalink:"/docs/safety",sidebar:"docs",category:"Guides",next:"error-handling",previous:"combinators",previous_title:"Combining Async Iterators",next_title:"Error Handling"},"error-handling":{id:"error-handling",title:"Error Handling",description:"Because error handling is important for creating robust applications, channels are designed to catch and propagate any errors they receive in a predictable fashion. Every promise which is passed to a channel is preemptively caught using `Promise.prototype.catch` to prevent unhandled rejections, and the errors are forwarded to the iterator methods `next`/`return`/`throw` so channel consumers can handle them.",source:"/Users/brian/Projects/channel/website/docs/06_error-handling.md",permalink:"/docs/error-handling",sidebar:"docs",category:"Guides",next:"inverted-channels",previous:"safety",previous_title:"How are Channels “Safe”?",next_title:"Inverted Channels"},"inverted-channels":{id:"inverted-channels",title:"Inverted Channels",description:"Sometimes, you want to create an async iterator which responds to calls to `next` as asynchronous events themselves. For instance, you might want to create a timer channel which fires a fixed period of time after `next` is called, or even throws an error if it is not called within that fixed period of time. You can create these *inverted channels* by taking advantage of the fact that channels unwrap and await promises and promise-like objects which are passed to the `push` function:",source:"/Users/brian/Projects/channel/website/docs/07_inverted-channels.md",permalink:"/docs/inverted-channels",sidebar:"docs",category:"Guides",next:"utilities",previous:"error-handling",previous_title:"Error Handling",next_title:"Additional Channel-Based Utilities"},utilities:{id:"utilities",title:"Additional Channel-Based Utilities",description:"In addition to the `@channel/channel` package, the [channel repository](https://github.com/channeljs/channel) and [package scope](https://www.npmjs.com/org/channel) contain various async utilities implemented with channels.",source:"/Users/brian/Projects/channel/website/docs/08_utilities.md",permalink:"/docs/utilities",sidebar:"docs",category:"Guides",previous:"inverted-channels",previous_title:"Inverted Channels"},"anti-patterns":{id:"anti-patterns",title:"Common Anti-Patterns",description:"**👷‍♀️ Under Construction 👷‍♂️**",source:"/Users/brian/Projects/channel/website/docs/09_anti-patterns.md",permalink:"/docs/anti-patterns"}},docsDir:"/Users/brian/Projects/channel/website/docs",docsSidebars:{docs:[{type:"category",label:"Getting Started",items:[{type:"doc",id:"quickstart"},{type:"doc",id:"overview"},{type:"doc",id:"rationale"}]},{type:"category",label:"Guides",items:[{type:"doc",id:"combinators"},{type:"doc",id:"safety"},{type:"doc",id:"error-handling"},{type:"doc",id:"inverted-channels"},{type:"doc",id:"utilities"}]}]},sourceToPermalink:{"/Users/brian/Projects/channel/website/docs/01_quickstart.md":"/docs/quickstart","/Users/brian/Projects/channel/website/docs/02_overview.md":"/docs/overview","/Users/brian/Projects/channel/website/docs/03_rationale.md":"/docs/rationale","/Users/brian/Projects/channel/website/docs/04_combinators.md":"/docs/combinators","/Users/brian/Projects/channel/website/docs/05_safety.md":"/docs/safety","/Users/brian/Projects/channel/website/docs/06_error-handling.md":"/docs/error-handling","/Users/brian/Projects/channel/website/docs/07_inverted-channels.md":"/docs/inverted-channels","/Users/brian/Projects/channel/website/docs/08_utilities.md":"/docs/utilities","/Users/brian/Projects/channel/website/docs/09_anti-patterns.md":"/docs/anti-patterns"},permalinkToId:{"/docs/quickstart":"quickstart","/docs/overview":"overview","/docs/rationale":"rationale","/docs/combinators":"combinators","/docs/safety":"safety","/docs/error-handling":"error-handling","/docs/inverted-channels":"inverted-channels","/docs/utilities":"utilities","/docs/anti-patterns":"anti-patterns"}}}}]);