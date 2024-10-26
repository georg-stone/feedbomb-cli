const RSSParser = require("rss-parser");
const inquirer = require("inquirer").default;
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { JSDOM } = require("jsdom");

const parser = new RSSParser();
const homeDir = require("os").homedir();
const configFilePath = path.join(homeDir, ".feedbombrc");

process.stdout.write("\x1Bc");

let feeds = [];

const loadFeeds = () => {
  if (fs.existsSync(configFilePath)) {
    const data = fs.readFileSync(configFilePath);
    feeds = JSON.parse(data);
  }
};

const saveFeeds = () => {
  if (fs.existsSync(configFilePath)) {
    const data = fs.readFileSync(configFilePath);
    const feedsData = JSON.parse(data);
    if (!Array.isArray(feedsData)) {
      console.error(
        "The .feedbombrc file in your home directory is not in array format, possibly due to being used by another program."
      );
      process.exit(1);
    }
  }
  fs.writeFileSync(configFilePath, JSON.stringify(feeds, null, 2));
};

const addFeed = async () => {
  const { feedName, feedUrl } = await inquirer.prompt([
    {
      type: "input",
      name: "feedName",
      message: "Enter a name for the feed:",
    },
    {
      type: "input",
      name: "feedUrl",
      message: "Enter the feed URL:",
    },
  ]);

  feeds.push({ name: feedName, url: feedUrl });
  saveFeeds();
};

async function fetchFeed(url) {
  try {
    const feed = await parser.parseURL(url);
    return feed.items.map((item) => {
      const html = `${item.contentSnippet || item.summary || item.content}`
        .replaceAll("<br>", "\n")
        .replaceAll("<br />", "\n")
        .replaceAll("<br/>", "\n");

      const dom = new JSDOM(html);
      const cleanedHTML = dom.window.document.body.textContent;

      return {
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        contentSnippet: cleanedHTML,
      };
    });
  } catch (error) {
    console.error("There was an error while fetching the feed:", error.message);
    return [];
  }
}

async function runRSSReader() {
  try {
    if (feeds.length === 0) {
      console.log("We couldn't find any feeds. Please add a feed.");
      await addFeed();
    }

    while (true) {
      const feedChoices = feeds
        .map((feed) => feed.name)
        .concat("Add a new feed");

      const { selectedFeed } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedFeed",
          message: "Your feeds",
          choices: feedChoices,
        },
      ]);

      if (selectedFeed === "Add a new feed") {
        await addFeed();
        continue;
      }

      const feedUrl = feeds.find((feed) => feed.name === selectedFeed).url;
      const articles = await fetchFeed(feedUrl);

      if (articles.length === 0) {
        console.log("no articles found.");
        return;
      }

      let currentIndex = 0;

      while (true) {
        const article = articles[currentIndex];

        console.clear();
        console.log(`\n${selectedFeed}\n`);
        console.log(
          `(${currentIndex + 1}/${articles.length}) ${article.title}`
        );
        console.log(`Published on: ${article.pubDate}`);
        console.log("\n" + article.contentSnippet);
        console.log(`\nLink: ${article.link}`);
        console.log("\n---\n");

        const { action } = await inquirer.prompt([
          {
            type: "list",
            name: "action",
            message: "Choose an action:",
            choices: [
              "Next article",
              "Previous article",
              "Choose another feed",
              "Open link in browser",
              "Quit application",
            ],
          },
        ]);

        if (action === "Next article") {
          process.stdout.write("\x1Bc");
          currentIndex = (currentIndex + 1) % articles.length;
        } else if (action === "Previous article") {
          process.stdout.write("\x1Bc");
          currentIndex = (currentIndex - 1 + articles.length) % articles.length;
        } else if (action === "Choose another feed") {
          process.stdout.write("\x1Bc");
          break;
        } else if (action === "Open link in browser") {
          const command =
            process.platform === "win32"
              ? `start ${article.link}`
              : process.platform === "darwin"
              ? `open ${article.link}`
              : `xdg-open ${article.link}`;

          exec(command, (err) => {
            if (err) {
              console.error("Failed to open link:", err);
            }
          });
        } else if (action === "Quit application") {
          return;
        }
      }
    }
  } catch (error) {
    if (error.message === "User force closed the prompt with 0 null") {
      return;
    } else {
      console.log("An error occurred:", error.message);
    }
  }
}

loadFeeds();
runRSSReader();
