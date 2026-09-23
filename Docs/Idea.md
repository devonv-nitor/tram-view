# Tram view

A web application that displays the status of the HSL tram network in Helsinki, Finland at a glance. Data is accessed in real time through the API
provided by digitransit.fi.

The core of the application is a map view showing the Helsinki region, with all active trams on the network shown as points that update their positions
live as they move around the city. The icons for these points should be circles with the line number inside. These line numbers can be digits from 1-15,
can also include a trailing letter (e.g. 9N, 5T) or be just a single letter (e.g. H).

Data is pulled from the digitransit.fi API in a way that allows for near-realtime data while also balancing against not slamming the API with too many requests.

All code should be written in Typescript and the application should use React. It should be deployable to github pages with no backend of its own.