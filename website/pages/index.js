/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from "react";
import classnames from "classnames";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import withBaseUrl from "@docusaurus/withBaseUrl";
import styles from "./styles.module.css";

function Button({ text, to, children }) {
  return (
    <Link
      className={classnames(
        "button button--outline button--primary button--lg",
        styles.getStarted,
      )}
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
    <header className={classnames("hero hero--dark", styles.header)}>
      <div
        className={styles.background}
        style={{ backgroundImage: `url(${withBaseUrl("img/smpte.svg")})` }}
      />
      <div className="container">
        <img src={withBaseUrl("img/logo.svg")} alt="logo" />
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Button to={withBaseUrl("docs/get-started")}>Get Started</Button>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  return (
    <Layout>
      <Hero />
      <main>
        <div className="container">
          <div className="row">This is a row</div>
        </div>
      </main>
    </Layout>
  );
}
