(window.webpackJsonp=window.webpackJsonp||[]).push([[7],{50:function(e,n,t){"use strict";t.r(n),t.d(n,"frontMatter",function(){return s}),t.d(n,"rightToc",function(){return i}),t.d(n,"default",function(){return h});t(0);var a=t(56);function r(){return(r=Object.assign||function(e){for(var n=1;n<arguments.length;n++){var t=arguments[n];for(var a in t)Object.prototype.hasOwnProperty.call(t,a)&&(e[a]=t[a])}return e}).apply(this,arguments)}function o(e,n){if(null==e)return{};var t,a,r=function(e,n){if(null==e)return{};var t,a,r={},o=Object.keys(e);for(a=0;a<o.length;a++)t=o[a],n.indexOf(t)>=0||(r[t]=e[t]);return r}(e,n);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);for(a=0;a<o.length;a++)t=o[a],n.indexOf(t)>=0||Object.prototype.propertyIsEnumerable.call(e,t)&&(r[t]=e[t])}return r}var s={id:"rationale",title:"Rationale"},i=[{value:"Why not async generators?",id:"why-not-async-generators",children:[]},{value:"Why not Observables?",id:"why-not-observables",children:[]}],c={rightToc:i},l="wrapper";function h(e){var n=e.components,t=o(e,["components"]);return Object(a.b)(l,r({},c,t,{components:n,mdxType:"MDXLayout"}),Object(a.b)("p",null,"While ",Object(a.b)("a",r({parentName:"p"},{href:"https://github.com/tc39/proposal-async-iteration"}),"async iterators")," are available in most modern javascript runtimes, they have yet to achieve widespread usage due to various perceived ",Object(a.b)("a",r({parentName:"p"},{href:"https://github.com/apollographql/graphql-subscriptions/issues/116"}),"flaws")," and ",Object(a.b)("a",r({parentName:"p"},{href:"https://github.com/tc39/proposal-async-iteration/issues/126"}),"pitfalls"),". What’s needed is something like the ",Object(a.b)("inlineCode",{parentName:"p"},"Promise")," constructor, which helped promises succeed by providing a common pattern for converting callback-based APIs into promises. The ",Object(a.b)("inlineCode",{parentName:"p"},"Channel")," constructor makes it easy to turn ",Object(a.b)("em",{parentName:"p"},"any")," callback-based source of data into an async iterator, and prevents common async iterator mistakes ",Object(a.b)("a",r({parentName:"p"},{href:"safety"}),"by design"),". The channel constructor is easy to memorize and is adaptable for almost every async iterator use case."),Object(a.b)("h2",null,Object(a.b)("a",r({parentName:"h2"},{"aria-hidden":!0,className:"anchor",id:"why-not-async-generators"})),Object(a.b)("a",r({parentName:"h2"},{"aria-hidden":!0,className:"hash-link",href:"#why-not-async-generators"}),"#"),"Why not async generators?"),Object(a.b)("p",null,"Channels are meant to be used alongside async generators. The problem with using async generators exclusively is that they rely on the ",Object(a.b)("inlineCode",{parentName:"p"},"yield"),", ",Object(a.b)("inlineCode",{parentName:"p"},"return")," and ",Object(a.b)("inlineCode",{parentName:"p"},"throw")," statements to produce values, which are unavailable in child closures. "),Object(a.b)("pre",null,Object(a.b)("code",r({parentName:"pre"},{className:"language-js"}),"async function* messages(url) {\n  const socket = new WebSocket(url);\n  socket.onmessage = (ev) => {\n     // can’t make the outer generator yield from here.\n  };\n}\n")),Object(a.b)("p",null,"The solution using async generators is often some ad-hoc ",Object(a.b)("inlineCode",{parentName:"p"},"while (true)")," loop which awaits a promise which adds and removes an event handler for each iteration, but the results are often prone to race-conditions, dropped messages, and memory leaks unless done with a very solid understanding of how generators and promises work. Channels behave identically to async generators, except they provide the ",Object(a.b)("inlineCode",{parentName:"p"},"yield"),", ",Object(a.b)("inlineCode",{parentName:"p"},"return")," and ",Object(a.b)("inlineCode",{parentName:"p"},"throw")," statements as the functions ",Object(a.b)("inlineCode",{parentName:"p"},"push")," and ",Object(a.b)("inlineCode",{parentName:"p"},"stop"),", allowing imperative control of the channel outside of the immediate function closure and making channels ideal for converting callback-based APIs into async iterators. Once you have converted callback-based APIs into channels, you can use channels seamlessly with async generators to write rich, easy-to-understand async code."),Object(a.b)("h2",null,Object(a.b)("a",r({parentName:"h2"},{"aria-hidden":!0,className:"anchor",id:"why-not-observables"})),Object(a.b)("a",r({parentName:"h2"},{"aria-hidden":!0,className:"hash-link",href:"#why-not-observables"}),"#"),"Why not Observables?"),Object(a.b)("p",null,Object(a.b)("strong",{parentName:"p"},"👷‍♀️ Under Construction 👷‍♂️")))}h.isMDXComponent=!0}}]);