# In-app message notices (plan)

Requested in chat on 2026-10-03, verbatim:

> If the user is on the messages page there shouldn't be a push notification
> but the new message thread should be highlighted for a second before fading
> out. If the user is in a message thread but they receive a new message for a
> different thread they should get an in app toast notification for that.
> Tapping it should work like the push notification. If it's new never opened
> thread it should go to the messages page with the new thread highlighted for
> a second, if it's a thread that's been opened previously it should go
> stright to it.

The design choices made in response, as stated in chat before implementing:

> - **How the board decides what to highlight:** after each live refresh, it
>   compares the board before and after. A thread is highlighted if it has
>   just become unread, or if it is unread and has a newer message than
>   before. That only ever catches your partner's messages, never your own
>   from another device, because "unread" already excludes those.
> - **How the thread page decides whether to toast:** a toast needs to know
>   whether the other thread's new message is from the partner. Live events
>   deliberately never say who sent something. So the thread page asks a small
>   new endpoint whether that thread is now unread for you.
> - **Tag edits get their own event kind, `tags`.** Today they share `thread`
>   with new threads, and would otherwise look like new messages.
