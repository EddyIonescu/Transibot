
How it works:

1. User sends their location in FB Messenger.
2. Transibot asks them to choose which stop they want.
3. Transibot shows the times of the next few buses for the routes serving that stop.

You can try it out here:
<a href="https://m.me/Transibot">m.me/Transibot</a>

Works for:
- Waterloo (GRT)
- San Francisco (MUNI)

In Progress:
- Toronto (TTC)
- All other agencies using <a href="https://www.nextbus.com/xmlFeedDocs/NextBusXMLFeed.pdf">NextBus</a>

Future:
- All agencies using <a href="https://developers.google.com/transit/gtfs-realtime/">GTFS-RT</a>
- Add support for other bot platforms, like WeChat, Slack, Skype, Kik, etc.

Architecture:

Messenger, Facebook, etc. <=> Transibot Node.JS app <= MongoDB <= <a href="https://github.com/EddyIonescu/GTFSupdate">GTFSupdate Go app</a>
