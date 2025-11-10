import {
  AddPrefixListEntry, DescribeManagedPrefixListsCommand,
  EC2Client,
  GetManagedPrefixListEntriesCommand,
  ModifyManagedPrefixListCommand, RemovePrefixListEntry,
} from '@aws-sdk/client-ec2';

const currentIp = await getMyIp();
console.log(currentIp, process.env.AWS_ACCESS_KEY_ID);

const defaultRegion = process.env.AWS_DEFAULT_REGION;

const prefixListIds = (process.env.PREFIX_LIST_ID ?? '').split(',');
const regions = (process.env.AWS_REGIONS ?? '').split(',');

await Promise.all(prefixListIds.map(updateForPrefixListId))

async function updateForPrefixListId(prefixListId: string, index: number) {
  const region = regions[index] ?? defaultRegion;

  const client = new EC2Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    }
  })

  const getManagedPrefixListCommand = new GetManagedPrefixListEntriesCommand({
    PrefixListId: prefixListId,
  });


  const [response, describeManagedPrefixListsResponse] = await Promise.all([ client.send(getManagedPrefixListCommand), client.send(new DescribeManagedPrefixListsCommand({
    PrefixListIds: [prefixListId]
  }))]);

  if (!describeManagedPrefixListsResponse.PrefixLists) {
    console.error({ describeManagedPrefixListsResponse });
    throw new Error(JSON.stringify(describeManagedPrefixListsResponse));
  }

  const entries = response.Entries;

  if (!entries) {
    throw new Error("No Entries array found in the response.");
  }

  const entryToChange = entries.find(v => v.Description === process.env.PREFERRED_DESCRIPTION_TO_CHANGE) ?? entries[0];

  const newCidr = `${currentIp}/32`;

  if (entryToChange && entryToChange.Cidr === newCidr) {
    console.info(`${region} IP up to date.`);
    return;
  }

  const toRemove: RemovePrefixListEntry[] = [];
  const toAdd: AddPrefixListEntry[] = [];

  if (entryToChange) {
    toRemove.push({ Cidr: entryToChange.Cidr });
  }
  toAdd.push({
    Cidr: newCidr,
    Description: entryToChange?.Description ?? 'Default',
  });

  const modifyResponse = await client.send(new ModifyManagedPrefixListCommand({
    PrefixListId: prefixListId,
    RemoveEntries: toRemove,
    AddEntries: toAdd,
    CurrentVersion: describeManagedPrefixListsResponse.PrefixLists[0].Version
  }));

  if (modifyResponse.$metadata.httpStatusCode !== 200) {
    console.error(modifyResponse);
    process.exit(1);
  }

  console.info(`${region} IP update successful.`);
}

async function getMyIp() {
  return (await (await fetch('https://api.ipify.org?format=json')).json()).ip;
}
