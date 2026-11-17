# Technical Troubleshooting Guide

_Owner: LumaNet Fiber Technical Support · Version 4.0_

## Step 1 — check the ONT lights
The ONT (the small white fiber box) has four lights: POWER, PON, LOS and LAN.
- **LOS light red or blinking red**: the fiber signal is lost (usually a cut or bent cable). This cannot be
  fixed remotely, so book a **technician visit**.
- **PON light blinking**: the ONT is trying to register; wait 5 minutes, then restart.
- **All lights normal but no internet**: continue to step 2.

## Step 2 — restart in the right order
Turn off the router and the ONT, wait **30 seconds**, turn on the ONT first, wait 2 minutes, then turn on the
router. This fixes most "connected but no internet" problems.

## Step 3 — slow speed
- Test with a cable on a computer at speedtest.lumanet.example; Wi-Fi speeds are usually lower.
- 2.4 GHz Wi-Fi is limited to about 50–70 Mbps; use the 5 GHz network for faster speeds.
- If wired speed is below 70% of the plan speed for more than 24 hours, open a "slow speed" ticket.

## Router access
The LumaNet router admin page is at **192.168.0.1**. Customers can change the Wi-Fi name and password there or
in the LumaNet app under Devices > Wi-Fi.

## Technician visits
Technician visits are free for faults on LumaNet's equipment. In Dhaka city a technician arrives within
**24 hours**; outside Dhaka within **48 hours**. If the fault was caused by the customer (for example a cable
cut during home renovation) a **500 BDT** visit fee applies.
