import {
  AddPrefixListEntry, DescribeManagedPrefixListsCommand,
  EC2Client,
  GetManagedPrefixListEntriesCommand,
  ModifyManagedPrefixListCommand, RemovePrefixListEntry,
} from '@aws-sdk/client-ec2';

const currentIp = await getMyIp();
console.log(currentIp, process.env.AWS_ACCESS_KEY_ID);

//TBC need seprate creds that don't need MFA

const client = new EC2Client({
  region: process.env.AWS_DEFAULT_REGION ?? '',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  }
})

const prefixListId = process.env.PREFIX_LIST_ID ?? '';
const getManagedPrefixListCommand = new GetManagedPrefixListEntriesCommand({
  PrefixListId: prefixListId,
});


const [response, describeManagedPrefixListsResponse] = await Promise.all([ client.send(getManagedPrefixListCommand), client.send(new DescribeManagedPrefixListsCommand({
  PrefixListIds: [prefixListId]
}))]);

if (!describeManagedPrefixListsResponse.PrefixLists) {
  console.error({ describeManagedPrefixListsResponse });
  process.exit(1);
}

const entries = response.Entries;

if (!entries) {
  throw new Error("No Entries array found in the response.");
}

const entryToChange = entries.find(v => v.Description === process.env.PREFERRED_DESCRIPTION_TO_CHANGE) ?? entries[0];

const newCidr = `${currentIp}/32`;

if (entryToChange && entryToChange.Cidr === newCidr) {
  console.info("IP up to date.");
  process.exit(0);
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

console.info("IP update successful.");

async function getMyIp() {
  return (await (await fetch('https://api.ipify.org?format=json')).json()).ip;
}
