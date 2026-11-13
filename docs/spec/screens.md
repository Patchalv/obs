# Screens

Ping uses a channel-first layout modelled on Slack: prototype variant **B2** in `prototypes/ping-screens/index.html` on the throwaway branch [`prototype/ping-screens`](https://github.com/Patchalv/ping/tree/prototype/ping-screens/prototypes/ping-screens). Open that file for the look; this page is the written contract. Variants A, B and C on the same branch are for reference only.

Product principles behind the layout: clearing Pings and working through Saved on a laptop takes as few steps as possible, and a Thread can be read and answered from a phone without effort.

## Laptop

### Top bar

- Dark, across the full width.
- The search bar sits in the centre (see [Search](#search)).
- The Staff member's avatar sits on the right. It opens their profile (display name and photo), sign-out, and for Admins the Admin screens.

### Sidebar

Dark, on the left, from top to bottom:

1. **Pings**, with a badge counting the Threads that have a Ping for you, and **Saved**. Each opens a list in the main area, like Slack's Activity view.
2. The Staff member's own **Sections**, in their chosen order, then the default **Channels** section.
3. **+ New section**, **Browse channels** and **Create channel**.

Rules:

- The sidebar lists only Channels you're a member of. Public channels you haven't joined are reached through search or Browse channels, which lists every Public channel with a Join button. This keeps the sidebar usable with hundreds of Channels.
- A Channel with Pings shows in bold with a count. A muted Channel's count is grey.
- A Private channel shows a lock icon.
- Sections are personal: you create, name, reorder and collapse your own, and nobody else sees them. A collapsed Section still shows any of its Channels that have Pings.
- Channels move between Sections by drag and drop, or with the Section picker in the Channel bar. Channels you haven't placed, including ones you've just joined, sit in the default Channels section.

### Channel view

A white **Channel bar** sits above a grey feed of Thread rows.

The Channel bar has:

- the name (with a lock icon if Private), the member count, a Mute toggle and **+ New Thread**;
- the description;
- **Threads**, **Files** and **Members** tabs, plus the Section picker;
- the Thread list controls: Status (Open, Resolved, All), Pings (All, With Pings), sort (Latest activity or Date started) and direction, with an "N Resolved hidden" note.

Channel admins also reach the Channel's settings and member management from the bar. A Staff member viewing a Public channel they haven't joined sees a **Join** button in place of + New Thread.

Each **Thread row** is a white card showing:

- the author and time;
- the title and a preview of the description;
- the first Attachments;
- "N Thread Responses · N new";
- a Saved marker and an "@You" marker when they apply;
- inline Acknowledge buttons at the top right: ✓ mark read, 👍 react, 🔖 Save.

A System thread row is styled as coming from Ping, not from a person. A Deactivated author shows greyed with a "Deactivated" label.

The **Files** tab lists the Channel's Attachments. The **Members** tab lists members, marks Channel admins, and shows Deactivated members greyed with their label.

### Thread view

- Opens as a side panel on the right of the Channel view.
- Its header holds the Acknowledge buttons (mark read, react, Save) and Resolve or reopen when allowed.
- Then the Thread itself, its Thread Responses, a "N new" divider above the Thread Responses that are new since you last Acknowledged, and the composer at the bottom.
- Opening a Thread never clears its Ping.
- Placeholders: "Thread Response deleted" and "Attachment removed by <name>".
- Edited content shows "edited", or "edited by <name>" when someone other than the author edited it.

### Pings and Saved views

These use the same Thread rows as the Channel feed, with the Channel name on each row. Pings are ordered by their latest activity and Saved by when each Thread was saved, newest first.

### Composer

- A TipTap editor with the allowed formatting only: headings, bold, italic, underline, strikethrough, inline code, code blocks, bullet and numbered lists, blockquotes, links, Mentions (@) and emoji.
- A new Thread has a title and a description.
- Attachments can be added while writing, with upload progress shown before sending. Images show inline previews and other files show as chips.

### Admin screens

Reached from the avatar menu, for Admins only:

- **Staff members:** everyone with their role and state. Invited people show Resend and Cancel (and "Expired, Resend" or "Email not sent, Resend" when those apply). Actions: invite, change role, change email, Deactivate, reactivate, remove a profile photo.
- **Settings:** maximum Attachment size and maximum files per Thread or Thread Response.

## Phone

- The home screen is the sidebar (Pings, Saved and Sections) under the dark top bar, with search behind an icon.
- Tapping a Channel shows its Channel bar and Thread list. The Acknowledge buttons sit under each row, within thumb reach.
- Tapping a Thread opens it full screen, with the composer at the bottom.
- The Section picker in the Channel bar replaces drag and drop.

## Search

- One search bar, always visible on laptop (behind an icon on phone).
- Clicking it opens a panel of filter chips: **In: #channel** (suggested when you're inside a Channel), **From: person**, and **Status** (All by default, Open, Resolved).
- Results have **All**, **Channels** and **Threads** tabs. Archived channels carry an "Archived" badge. Opening a Thread Response match scrolls to that Thread Response.

The rules behind search are in [product.md](product.md#search).

## Other flows

- **Sign-in**, **forgot password** and **set password** (from an invite or reset link) pages.
- **Accepting an invite** lands the new Staff member on **Browse channels**.
- **Create channel:** name, description and visibility.
- **Making a Private channel Public** shows a warning that every Staff member will be able to see its whole history.
- **Leaving as the last active Channel admin** is stopped with an explanation (see [product.md](product.md#members-and-channel-admins)).
- **Deleting a Thread that has other people's Thread Responses** asks for confirmation and says how many Thread Responses will be deleted.

Source: [How should Ping's inbox, Channel and Thread screens look on laptop and phone?](https://github.com/Patchalv/ping/issues/8#issuecomment-6862576413)
