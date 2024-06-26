import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import { Cluster } from "puppeteer-cluster";
import { z } from "zod";

import db from "@/db";
import { ProductCreateInput } from "@/models/product";

const URL = "https://shop.silpo.ua/offers";

dotenv.config();

const app: Express = express();

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    statusCode: statusCode,
    message: error.message,
  });
});

app.get("/", (req, res) => {
  res.json({ message: "hello", statusCode: 200 });
});

app.listen(8000, () => {
  console.log(`App is listening on port ${process.env.SERVER_PORT}`);

  async function insertProducts(
    products: Array<z.infer<typeof ProductCreateInput>>,
  ) {
    const validProducts = products.map((product) =>
      ProductCreateInput.parse(product),
    );

    try {
      const result = await db.product.createMany({
        data: validProducts,
        skipDuplicates: true,
      });

      console.log(`${result.count} products inserted.`);
    } catch (error) {
      console.error("Error inserting products:", error);
    } finally {
      await db.$disconnect();
    }
  }

  async function mainFunction() {
    const browser = await puppeteer.launch({
      headless: true,
    });
    const page = await browser.newPage();

    await page.goto(URL, { waitUntil: "domcontentloaded" });

    await page.waitForSelector(".products-list__item");

    const categoryButton = await page.waitForSelector("#category-menu-button");

    if (categoryButton === null) {
      throw new Error("Category button is missing");
    }
    await categoryButton.click();

    await page.waitForSelector(".menu-categories__link");

    const categoriesLinks = await page.$$eval(
      ".menu-categories__link",
      (elements) =>
        elements.map(
          (product) => `https://shop.silpo.ua${product.getAttribute("href")}`,
        ),
    );

    await browser.close();

    const cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_PAGE,
      maxConcurrency: 6,
      timeout: 1200000,
      monitor: true,
      puppeteerOptions: {
        protocolTimeout: 1200000,
        headless: true,
      },
    });

    const allProducts: {
      [key: string]: { title: string; category: string }[];
    } = {};

    await cluster.task(async ({ page, data: url }) => {
      try {
        await page.setRequestInterception(true);
        page.on(
          "request",
          (req: {
            resourceType: () => string;
            abort: () => void;
            continue: () => void;
          }) => {
            if (req.resourceType() === "image") {
              req.abort();
            } else {
              req.continue();
            }
          },
        );

        await page.goto(url, { waitUntil: "domcontentloaded" });
        const pageTitle = await page.title();

        let stop = false;

        allProducts[pageTitle] = [];

        while (!stop) {
          try {
            await page.waitForSelector(".products-list__item");

            const productsListItems = await page.$$eval(
              ".product-card__title",
              (elements, pageTitle) =>
                elements.map((product) => ({
                  title: product.innerHTML.trim(),
                  category: pageTitle,
                })),
              pageTitle,
            );

            allProducts[pageTitle] = [
              ...allProducts[pageTitle],
              ...productsListItems,
            ];

            const isPaginationMoreButtonDisable = await page.$(
              ".pagination-arrow:not(.pagination-arrow--left).pagination-arrow--disabled",
            );

            if (isPaginationMoreButtonDisable !== null) {
              stop = true;
              await insertProducts(allProducts[pageTitle]);
              console.log(`${pageTitle} – completed`);
              return;
            }

            await page.waitForSelector(
              ".pagination-arrow:not(.pagination-arrow--left)",
              { visible: true },
            );

            await page.evaluate(() => {
              const paginationButton = document.querySelector(
                ".pagination-arrow:not(.pagination-arrow--left)",
              );
              if (paginationButton != null) {
                // @ts-ignore
                paginationButton.click();
              }
            });
          } catch (error) {
            throw new Error(`Error in ${pageTitle}: ${error}`);
          }
        }
      } catch (error) {
        console.log(`Cluster task failed: ${error}`);
        return cluster.queue(url);
      }
    });

    for (const link of categoriesLinks) {
      await cluster.queue(link);
    }

    await cluster.idle();
    await cluster.close();
  }
  mainFunction();
});
