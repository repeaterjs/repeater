/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from "react";
import classnames from "classnames";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import withBaseUrl from "@docusaurus/withBaseUrl";

import Layout from "@theme/Layout";
import CodeBlock from "@theme/CodeBlock";
import styles from "./styles.module.css";

function Button({ text, to, children }) {
  return (
    <Link
      className="button button--outline button--primary button--lg"
      to={to}
    >
      {children}
    </Link>
  );
}

function Hero() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;
  return (
    <header className={classnames("hero hero--dark", styles.hero)}>
      <div
        className={styles.background}
        style={{ backgroundImage: `url(${withBaseUrl("img/smpte.svg")})` }}
      />
      <div className="container">
        <img src={withBaseUrl("img/logo.svg")} alt="logo" />
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
      </div>
    </header>
  );
}

function Body() {
  return (
    <main className="container margin-vert--xl">
      <div className="row margin--xl">
        <div className="col">
          <h2 className="text--center">Convenient</h2>
          <p className="text--justify">Channels provide a promise-fluent API for setting up and tearing down callbacks. The same constructor function can be used to convert *any* callback-based source of data (event emitters, streams, observables) into an async iterator.</p>
        </div>
        <div className="col">
          <h2 className="text--center">Safe</h2>
          <p className="text--justify">Channels are carefully designed to prevent many common async iterators mistakes from ever happening. They initialize lazily, provide strategies for dealing with backpressure and propagate errors in a predictable fashion.</p>
        </div>
        <div className="col">
          <h2 className="text--center">Powerful</h2>
          <p className="text--justify">
            TKTK The Channel class emulates the simplicity of the Promise constructor. Channels are designed with the explicit goal of behaving exactly like async generators and contain no methods or properties not found on the async iterator interface.
          </p>
        </div>
      </div>
      <div className="row">
        <div className="col">
          <h2>Quickstart</h2>
          <CodeBlock>$ npm install @channel/channel</CodeBlock>
          <br />
          <CodeBlock>$ yarn add @channel/channel</CodeBlock>
          <br />
          <CodeBlock className="javascript">{`
import { Channel } from "@channel/channel";

const timestamps = new Channel(async (push, _, stop) => {
  push(Date.now());
  const timer = setInterval(() => push(Date.now()), 1000);
  await stop;
  clearInterval(timer);
});

(async function() {
  let i = 0;
  for await (const timestamp of timestamps) {
    console.log(timestamp);
    i++;
    if (i >= 10) {
      console.log("ALL DONE!");
      break; // triggers clearInterval above
    }
  }
})();
          `}</CodeBlock>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Layout>
      <Hero />
      <Body />
    </Layout>
  );
}
