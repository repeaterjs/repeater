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

const highlights = [
  {
    title: "Easy to use",
    imageUrl: "img/undraw_docusaurus_mountain.svg",
    description:
      "Docusaurus was designed from the ground up to be easily installed and used to get your website up and running quickly.",
  },
  {
    title: "Focus on your docs",
    imageUrl: "img/undraw_docusaurus_tree.svg",
    description:
      "Docusaurus lets you focus on your docs, and we'll do the chores. Now go ahead and dump all your docs into the docs directory.",
  },
  {
    title: "Powered by React",
    imageUrl: "img/undraw_docusaurus_react.svg",
    description:
      "Extend or customize your project's layout by reusing React. Docusaurus can be extended while reusing the same header and footer.",
  },
];

/* Note that this is only temporary. TODO: better welcome screen */
function Home() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;
  return (
    <Layout>
      <header
        className={classnames("hero hero--dark", styles.header)}
        style={{ backgroundImage: `url(${withBaseUrl("img/smpte.svg")})` }}
      >
        <div
          className="container"
        >
          {/*
          <img src={withBaseUrl("img/logo.svg")} alt="logo" />
            */}
          <h1 className="hero__title">{siteConfig.title}</h1>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link
              className={classnames(
                "button button--outline button--primary button--lg",
                styles.getStarted,
              )}
              to={withBaseUrl("docs/get-started")}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>
      <main>
        <section className={styles.highlights}>
          <div className="container">
            <div className="row">This is a row</div>
          </div>
        </section>
      </main>
    </Layout>
  );
}

export default Home;
