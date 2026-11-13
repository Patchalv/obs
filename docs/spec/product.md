# Product behaviour

What Ping does, rule by rule. The screens are in [screens.md](screens.md), and who may do each action is spelled out in [permissions.md](permissions.md).

## Staff members and roles

- A **Staff member** is a person employed by Spark who can sign in. There are about 20.
- Each Staff member has one company role: **Admin** or **Member**.
- Admins invite Staff members, set their role, change their email, Deactivate and reactivate them, and edit Spark-wide settings. They can also edit or delete any Thread or Response in the Channels they can see.
- Admins see only the Private channels they are members of. Private means private, even to Admins.
- Spark always has at least one active Admin. The last active Admin can't demote or Deactivate themself.
- A Staff member is in one of three states:
  - **Invited:** an Admin has invited them and they haven't set a password yet.
  - **Active:** they have joined and can sign in.
  - **Deactivated:** they can no longer sign in. See [Deactivation](#deactivation).

### Profiles

- Every Staff member can change their own display name and upload, replace or remove their own profile photo.
- Only Admins change a Staff member's email.
- A profile photo is resized in the browser to 512 px on its long edge, re-encoded and stripped of all metadata, like an image Attachment. Any signed-in Staff member can see it. Without a photo, Ping shows coloured initials.
- An Admin can remove anyone's profile photo.

Source: decided while writing this spec.

## Sign-in, invites and password reset

Sign-in is by email and password. Public sign-up is disabled: the only way in is an invite.

### The first Admin

- A one-time CLI command, `bootstrap-admin --email --name`, run by Patrick through `fly ssh console`, creates an Admin invite and sends the normal invite email. The CLI never sets a password.
- It refuses to run if any Admin exists, whether active or Invited.
- Patrick is the bootstrap Admin and stays an Admin. He invites Doug and Inge as Admins through the app.

### Invites

- An Admin invites someone with a name, an email and a role (Admin or Member). This creates the auth user (with no password yet) and the Staff member in one transaction.
- Inviting an email that's already in use is refused. The message says whether that person is active, Invited or Deactivated, and a Deactivated person is offered Reactivate instead.
- The invite link lasts 7 days and works once. Its token is stored hashed.
- **Invited** people appear only in the Admins' list of Staff members, with **Resend** and **Cancel**. They can't be added to Channels or mentioned until they join.
- **Resend** issues a new token and invalidates the old one. An expired invite stays Invited and shows "Expired, Resend".
- **Cancel** hard-deletes the Invited person, since they have written nothing. Deactivation applies only to people who have joined.
- **Accepting:** the link opens a set-password page showing the name and a read-only email. Submitting sets the password, marks the email verified, signs the person in and lands them on **Browse channels**.

### Password reset

- Self-service from the sign-in page. The reset link lasts 1 hour and works once.
- Rate limits: 3 requests per email per hour, plus Better Auth's per-IP limiter.
- A completed reset signs the person out of every other session.
- Unknown, Invited and Deactivated emails all get the same reply ("If that account exists, we've sent a link") and no email is sent.

### Email sending

- Invite and reset emails are sent inline over SMTP (Brevo), with no queue. Sender details are in [platform.md](platform.md#email).
- If an invite email fails, the invite still exists, the Admin sees "Email not sent, Resend", and the failure is reported to Sentry.
- If a reset email fails, the person still sees the generic reply, and the failure is reported to Sentry.

Source: [How do the first Admins get in, and how do invite and reset emails arrive?](https://github.com/Patchalv/ping/issues/15#issuecomment-6863586131)

## Channels

- A **Channel** is a long-lived space for one topic: a 1:1 line with a manager, a task, a project or a team.
- Anyone can create a Channel and becomes its first **Channel admin**.
- A Channel is **Public** (any Staff member can find, view and join it) or **Private** (only its members can find and view it).
- A Channel's settings are its name, description, visibility, and **Who can resolve threads?**, which is either "Any Channel member" (the default) or "Thread author and Channel admins".
- Only Channel admins change a Channel's settings. Visibility can change in either direction. Before a Private channel becomes Public, a warning says every Staff member will be able to see its whole history. Every visibility change starts a [System thread](#system-threads).
- When a Channel turns Private, every Staff member who isn't a member loses access at once (see [Losing access](#losing-access)).
- Channels are never deleted, by anyone. They can only be archived.

### Members and Channel admins

- Anyone can join a Public channel, and any Channel member can add people to it.
- Only Channel admins add people to a Private channel.
- Only active Staff members can be added. Invited and Deactivated people don't appear in pickers.
- Only Channel admins remove members, appoint Channel admins and remove the role.
- A Channel always has at least one active Channel admin.
- Anyone can leave a Channel, except its last active Channel admin. Ping stops them and says another member must be made Channel admin first. If they're the only member, it tells them to archive the Channel, or to add someone and make that person Channel admin.
- Automatic promotion happens only when a Staff member is Deactivated, never when someone leaves.
- Someone who leaves a Private channel loses access until they are added back.

### What company Admins can do to a Channel

- Archive and unarchive any Public channel and any Private channel they're a member of.
- Make anyone, including themselves, a Channel admin of a Public channel.
- Nothing else directly. To edit a Public channel or manage its members, an Admin makes themself Channel admin first, which shows in the member list.
- Nothing at all on a Private channel they aren't a member of.

Sources: [Who can do what in a Channel?](https://github.com/Patchalv/ping/issues/6), [What happens to a Deactivated Staff member's Channels and Threads?](https://github.com/Patchalv/ping/issues/5)

### Archive

- Channel admins archive and unarchive their Channel. Company Admins can too, as above.
- An **Archived channel** stays readable and searchable by everyone who could read it before. Its search results carry an "Archived" badge.
- Archiving Pings nobody, apart from its System thread. Open Pings stay until they're Acknowledged.
- In an Archived channel:
  - **Blocked:** new Threads, Responses and reactions; edits; deletes by authors; Resolve and reopen; changing settings; adding, removing or promoting members; joining.
  - **Still allowed:** reading and search; Acknowledging (mark read); Save; Mute; leaving; company Admins deleting Threads and Responses; removing Attachments *(proposed, so personal data can always come down)*; unarchiving.

Source: decided while writing this spec.

## Threads and Responses

- A **Thread** is a sub-topic inside a Channel. It has a title and a rich-text description.
- A **Response** is a rich-text message inside a Thread.
- Only Channel members start Threads, send Responses and react. A Staff member reading a Public channel they haven't joined can read, Acknowledge (mark read or Save) and Mute Threads, but must join before posting or reacting.
- **Latest activity** is the later of when a Thread was started and when its newest Response was posted. Edits, reactions and resolving or reopening don't count, and deleting a Response doesn't move it back.

### Rich text

- The editor is TipTap. Bodies are stored as ProseMirror JSON ([ADR 0003](../adr/0003-rich-text-stored-as-prosemirror-json.md)).
- The server accepts only: headings; bold, italic, underline and strikethrough; inline code and code blocks; bullet and numbered lists; blockquotes; links with `http`, `https` or `mailto`; Mentions; and emoji as Unicode. It rejects any document with anything else, whatever the front end did.

### Editing

- Authors edit their own Thread (title and description) and their own Responses at any time.
- Company Admins edit any Thread or Response in the Channels they can see, including content by Deactivated Staff members.
- Channel admins can't edit other people's content.
- Edits are marked "edited". When the editor isn't the author, the mark reads "edited by <name>".
- Only the latest text is kept. There is no edit history.

### Deleting

- Authors delete their own Threads and Responses. Company Admins delete any Thread or Response in the Channels they can see.
- Channel admins can't delete other people's Threads or Responses.
- **Deleting a Thread** removes it completely: its Responses (including other people's), reactions, Mentions and Attachments, and everyone's Pings and Saved entries for it. When the author deletes a Thread that has other people's Responses, a confirmation first says how many will go.
- **Deleting a Response** removes its content, reactions and Attachments for real and leaves a "Response deleted" placeholder, so the Thread still reads correctly.

### Reactions

- Channel members react to a Thread or a Response with any Unicode emoji. Each person can add each emoji once per item.
- Reactions never Ping anyone, including the author.

### Mentions

- Typing @ in a Thread or Response picks a Staff member to Mention. A Mention always Pings them, whatever their mute settings.
- Only Staff members who can read the Thread can be Mentioned. In a Public channel that's any active Staff member, and Mentioning a non-member doesn't make them join. In a Private channel the picker lists only Channel members.
- Mentions store the Staff member's ID, so renaming someone never breaks one.
- A Mention added in an edit Pings only the newly Mentioned people.

### Resolve and reopen

- A **Resolved thread** is marked finished. It's hidden from its Channel's Thread list unless someone shows resolved Threads, still appears in search, and can be reopened.
- The Channel's "Who can resolve threads?" setting decides who can resolve, and the same rule decides who can reopen.
- Anyone allowed to resolve in a Channel can resolve a Deactivated Staff member's open Threads.
- Resolving and reopening Ping nobody. A Mention is the way to call attention to a reopen.

### System threads

- A **System thread** is a Thread that Ping itself starts to announce a change to a Channel. Nobody can respond as its author.
- Ping starts one when:
  - a Channel's visibility changes;
  - a Channel is archived;
  - a Deactivated sole Channel admin is replaced automatically (it names the new Channel admin and the Deactivated person, so the Channel can choose someone else).
- A System thread stores the Staff members involved by ID and renders their names when viewed, so names stay current.
- Like any new Thread, it Pings every active Channel member, including people who have muted the Channel.

Sources: [Who can do what in a Channel?](https://github.com/Patchalv/ping/issues/6), [Exactly when does a Ping appear, update and clear?](https://github.com/Patchalv/ping/issues/7), [What is Ping's data model?](https://github.com/Patchalv/ping/issues/11#issuecomment-6861774289)

## Pings

A **Ping** tells one Staff member about other people's new activity in one Thread, with a count of what's new since they last Acknowledged it.

### The core rule

- Each Staff member has at most one open Ping per Thread.
- While a Ping is open, new activity raises its count. The count covers new Threads, Responses and Mentions since the last Acknowledge.
- Acknowledging clears the Ping. The next new activity starts a fresh Ping at 1.
- Viewing a Thread never clears its Ping.

### Who gets a Ping

- **A new Thread** (including a System thread): every active Channel member except its author. Mutes are ignored.
- **A new Response:**
  - every active Channel member who hasn't muted the Channel or the Thread;
  - plus anyone who has Saved the Thread, even if they've since left a Public channel;
  - plus anyone Mentioned in it.
- **A Mention:** the Mentioned person, always, even if they muted the Thread or Channel. The mute stays in place.
- Never the person who acted. Nothing you do yourself ever Pings you, including starting a Thread.
- Never for edits (except a newly added Mention), reactions, resolving, reopening, or deleting.
- Deactivated Staff members never get Pings.

### Acknowledge

To **Acknowledge** a Ping is to clear it by one of these actions:

- **Mark read.**
- **React** with an emoji, to the Thread or any of its Responses.
- **Save** the Thread.
- **Send a Response** in the Thread.

### Edge cases

- **Activity after Acknowledging** creates a fresh Ping, subject to Mute.
- **Saved** doesn't mute a Thread: a Thread you've Saved still gets Pings. Removing it from Saved leaves any Ping alone, and a Ping never adds anything to Saved.
- **Resolved threads and Archived channels:** existing Pings stay until Acknowledged.
- **Joining a Public channel** back-fills nothing. Pings start with the first activity after joining.
- **Deleting a Thread** removes its Pings for everyone. Deleting a Response doesn't change open Ping counts, and nothing is recounted.

### Losing access

One clean-up routine handles all four cases:

- **Leaving a Public channel:** you keep your Pings and Saved Threads for it, because you can still read it. You lose your Channel and Thread mutes for it, and its Section placement.
- **Leaving, or being removed from, a Private channel:** you lose your Pings, Saved Threads, mutes and Section placement for it.
- **A Channel turning Private:** every non-member loses their Pings, Saved Threads, mutes and Section placement for it, in the same transaction as the change.
- **Being Deactivated:** see [Deactivation](#deactivation).

Sources: [Exactly when does a Ping appear, update and clear?](https://github.com/Patchalv/ping/issues/7), refined by [What is Ping's data model?](https://github.com/Patchalv/ping/issues/11#issuecomment-6861774289)

## Saved

- **Saved** is each Staff member's personal list of Threads to come back to: to read later when they have time, to write a Response, or to act on. Nobody else sees it.
- Saving a Thread Acknowledges its Ping.
- A Thread leaves the list when its owner removes it, or when they can no longer read the Thread. There's no history of removed items.

## Mute

- A Staff member can **Mute** a whole Channel they're a member of, or a single Thread they can read.
- While muted, new Responses don't Ping them. New Threads and Mentions still do.
- Leaving a Channel drops your mutes for it.

## Attachments

- Images and files can be attached to Threads and Responses.
- **Limits** are Spark-wide settings that Admins edit:
  - maximum file size: default 20 MB, ceiling 50 MB;
  - maximum files per Thread or Response: default 5, ceiling 20.
- There's no storage quota. Monitoring warns at 80% of the storage free tier.
- **Allowed types** are fixed in code: JPEG, PNG, WebP, GIF, HEIC, PDF, Word, Excel and PowerPoint (OOXML), OpenDocument, TXT and CSV. The server checks magic bytes as well as the extension.
- **Images** are resized in the browser to about 2048 px on the long edge, re-encoded, and stripped of all metadata, including GPS. Other files are stored unchanged.
- **Uploading while writing:** files upload while the post is still being written, so the composer can show progress. Until the post is saved, only the uploader can see them. Uploads never posted are swept after 24 hours.
- **Access:** exactly the Staff members who can read the Thread, including in Archived channels and Resolved threads. Every download goes through Ping's server, which checks permission and then hands out a signed link that expires in under 5 minutes. No link is ever public or permanent.
- **Downloads** are served with `Content-Disposition: attachment` (images inline) and `X-Content-Type-Options: nosniff`. There's no virus scanning in the MVP.
- **Removal:** the uploader, company Admins (in Channels they can see) and the Channel's admins can remove an Attachment. Removal deletes the file from storage for real, and an "Attachment removed by <name>" placeholder stays. This is a deliberate exception to "keep everything", so wrongly shared personal data can come down.
- Attachments by Deactivated Staff members are kept.

Source: [Are attachments in the MVP?](https://github.com/Patchalv/ping/issues/4), with removal confirmed while writing this spec.

## Deactivation

- An Admin Deactivates a Staff member who has left. They can no longer sign in, and all their sessions end at once.
- **Kept:** their name and login, their Channel memberships and Channel admin roles (shown greyed with a "Deactivated" label), and everything they wrote, attributed to them with the same label.
- **Discarded:** their Saved list, Pings, mutes and Section placements.
- They no longer appear when people are being picked, get no Pings, and don't count as active members or active Channel admins.
- Their open Threads stay open. Anyone allowed to resolve in that Channel can resolve them, and only company Admins can edit them.
- **Sole Channel admin:** if they were a Channel's only active Channel admin, the active member who joined it earliest is promoted (a tie goes to whoever became a Staff member first), and a System thread announces it.
- **Empty Channels:** a Channel left with no active members is archived automatically. A 1:1 Private channel where one person is Deactivated stays open: the other person becomes Channel admin and can archive it themselves.
- **Reactivation:** Admins can reactivate. Memberships and Channel admin roles come back as they were, and any promotions made meanwhile also stand. Saved and Pings start empty.

Source: [What happens to a Deactivated Staff member's Channels and Threads?](https://github.com/Patchalv/ping/issues/5)

## Search

### What it looks in

- Public channels (joined or not) and the Private channels you're a member of. Admins get no extra reach.
- Archived channels, with an "Archived" badge on their results.
- Resolved threads, by default.
- Never deleted Threads or Responses. Content by Deactivated Staff members stays searchable, and they can still be picked in the From filter.

### What it matches

- Channel name and description.
- Thread title, Thread description and Response text.
- **Not** Attachment filenames, file contents or people's names.

### Matching

- English word-based full-text matching with stemming ("booking" also finds "booked"), using Postgres's own full-text search.
- The last word matches as a prefix while you type, and every word must match.
- No typo tolerance.

### Results and filters

- Tabs: **All**, **Channels** and **Threads**. All shows the top few Channels above the Threads.
- One result per Thread. When the match is in a Response, the result shows that Response's snippet, and opening it scrolls to that Response.
- Results are sorted by Latest activity, newest first.
- Filter chips: **In: #channel** (offered as a one-click suggestion when you search from inside a Channel, never applied by default), **From: person**, and **Status: All (default), Open or Resolved**.
- Not in the MVP: date ranges, "has a link", "includes me", file search or people search.

### A Channel's Thread list (not search)

- **Status:** Open (default), Resolved or All.
- **Pings:** All (default) or With Pings, meaning Threads where you have a Ping right now. The label avoids "Unread", because Ping has no separate read state. Known gap: a muted Thread's new Responses don't create a Ping, so it won't show under With Pings.
- **Sort:** Latest activity (default) or Date started, newest or oldest first.
- These choices are remembered per Channel in the browser only. A new device starts from the defaults.

Source: [What can search find in the MVP?](https://github.com/Patchalv/ping/issues/9)

## Live updates

- Each open browser holds one Server-Sent Events connection. It carries new Threads and Responses, reactions, resolve and reopen, and Ping counts, filtered to what that Staff member can read. It also carries edits, deletions, membership changes and Channel changes *(proposed)*, so open screens stay correct.
- Every user action is an ordinary request. The stream only pushes.
- The server sends a heartbeat every 20–30 seconds. A client that reconnects resumes with `Last-Event-ID`; one that has fallen too far behind refetches.

Source: [Choose Ping's stack and hosting](https://github.com/Patchalv/ping/issues/3) and [ADR 0001](../adr/0001-portable-low-cost-eu-stack.md).

## Audit log

Security-relevant actions are recorded and kept for one year: sign-ins (successful and failed), invites, role and email changes, Deactivations and reactivations, Channel visibility and membership changes, and company Admins editing or deleting other people's content. Reads are not logged. Nobody reads the log through the app; Patrick reads it in the database when needed.

Source: [How is Ping deployed, backed up and monitored?](https://github.com/Patchalv/ping/issues/12#issuecomment-6862919205)
