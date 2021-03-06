import {
  AxiosResponse,
  default as axios,
} from 'axios';
import { JSDOM } from 'jsdom';
import { MongoClient } from 'mongodb';
import { enableTimestampLogger } from './logger';
import * as iconv from 'iconv-lite';

enum MonitorType {
  XPATH = 'XPATH',
}

function resolveEnv(): void {
  const MONITOR_NAME = process.env.MONITOR_NAME as string;
  const MONITOR_URL = process.env.MONITOR_URL as string;
  const MONITOR_TYPE = process.env.MONITOR_TYPE as MonitorType;
  const MONITOR_EXPRESSION = process.env.MONITOR_EXPRESSION as string;
  const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL as string;
  const MONGO_URL = process.env.MONGO_URL as string;

  if (
    [
      [ MONITOR_NAME, 'MONITOR_NAME' ],
      [ MONITOR_URL, 'MONITOR_URL' ],
      [ MONITOR_TYPE, 'MONITOR_TYPE' ],
      [ MONITOR_EXPRESSION, 'MONITOR_EXPRESSION' ],
      [ SLACK_WEBHOOK_URL, 'SLACK_WEBHOOK_URL' ],
      [ MONGO_URL, 'MONGO_URL' ],
    ]
      .reduce(
        (error, [ value, key ], index, arr) => {
          if (value === undefined) {
            console.warn(`${key} is not defined.`);
            console.warn();
            return true;
          }

          return error;
        },
        false,
      )
  ) {
    process.exit(1);
  }

  if (
    [
      [ MONITOR_URL, 'MONITOR_URL' ],
      [ SLACK_WEBHOOK_URL, 'SLACK_WEBHOOK_URL' ],
      [ MONGO_URL, 'MONGO_URL' ],
    ]
      .reduce(
        (error, [ value, key ], index, arr) => {
          if (!validateUrl(value)) {
            console.warn(`key(${value}) is not a valid URL.`);
            console.warn();
            return true;
          }

          if (index === arr.length - 1 && error) {
            process.exit(1);
          }

          return error;
        },
        false,
      )
  ) {
    process.exit(1);
  }

  if (
    [
      [ MONITOR_TYPE, 'MONITOR_TYPE' ],
    ]
      .reduce(
        (error, [ value, key ], index, arr) => {
          if (!validateMonitorType(value)) {
            console.warn(`key(${value}) is not a valid monitor type.`);
            console.warn(`  Valid monitor types are: ${JSON.stringify(Object.keys(MonitorType))}.`);
            console.warn();
            return true;
          }

          if (index === arr.length - 1 && error) {
            process.exit(1);
          }

          return error;
        },
        false,
      )
  ) {
    process.exit(1);
  }

  console.log(`Environments:\n${[
    'MONITOR_NAME',
    'MONITOR_URL',
    'MONITOR_TYPE',
    'MONITOR_EXPRESSION',
    'SLACK_WEBHOOK_URL',
    'MONGO_URL',
  ].map(key => `  ${key}=${process.env[key]}`).join('\n')}`);
}

function validateUrl(url: unknown): url is string {
  try {
    new URL(url as string);
  } catch (_) {
    return false;
  }

  return true;
}

function validateMonitorType(type: unknown): type is MonitorType {
  return Boolean(MonitorType[type as MonitorType]);
}

const monitorResolver: Record<MonitorType, (body: string) => string> = {
  [MonitorType.XPATH]: (body: string): string => {
    const window = new JSDOM(body).window;
    const xpathResult = window.document.evaluate(process.env.MONITOR_EXPRESSION!, window.document, null, window.XPathResult.FIRST_ORDERED_NODE_TYPE, null);

    if (!xpathResult.singleNodeValue) {
      throw new Error('XPath evaluation result does not exist.');
    }

    return xpathResult.singleNodeValue.textContent ?? '';
  },
};

function notifySlack(text: string): Promise<AxiosResponse> {
  return axios.request({
    method: 'POST',
    url: process.env.SLACK_WEBHOOK_URL,
    data: {
      text: `Wachete notification \n`
        + `Name: <${process.env.MONITOR_URL}|${process.env.MONITOR_NAME}>\n`
        + text,
    },
  });
}

function catchError(error: any): Promise<unknown> {
  const errorText = `Error: ${error.name}: ${error.message}`;

  console.error(errorText);
  console.error(error);

  return notifySlack(errorText);
}

(async () => {
  enableTimestampLogger();
  resolveEnv();

  let body!: string;

  try {
    const response = await axios.get(process.env.MONITOR_URL!);

    const contentType = response.headers['content-type'];
    const charset = (/charset=([^;]*)/.exec(contentType) || [])[1] || 'utf-8';

    const buffer = (await axios.request(
      {
        method: 'GET',
        url: process.env.MONITOR_URL,
        responseType: 'arraybuffer',
        responseEncoding: 'binary',
      },
    )).data;

    body = iconv.decode(Buffer.from(buffer), charset);
  } catch (error) {
    await catchError(error);
    return;
  }

  let value: string;

  try {
    value = monitorResolver[process.env.MONITOR_TYPE as MonitorType](body)
      .trim()
      .replace(/\s+/g, ' ');
  } catch (error) {
    await catchError(error);
    return;
  }

  const client = new MongoClient(process.env.MONGO_URL!);
  await client.connect();
  const collection = client.db().collection('status');

  const lastValue = (await collection.findOne({ name: process.env.MONITOR_NAME }))?.value;

  console.log(`Last value: ${JSON.stringify(lastValue)}`);
  console.log(`New value: ${JSON.stringify(value)}`);

  if (lastValue !== value) {
    await collection.replaceOne(
      {
        name: process.env.MONITOR_NAME
      },
      {
        name: process.env.MONITOR_NAME,
        value: value,
      },
      {
        upsert: true,
      },
    );
    await notifySlack(`Value: ${value}`);
  }

  await client.close();
})();
