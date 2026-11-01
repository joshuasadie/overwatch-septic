# Pending changes (not yet live)

Last updated: November 1, 2026. Branch: `report-payment-flow` (built, tested, not merged).

## Built on the branch, waiting for Josh's OK

### Contract wording: agreement version 2 (new agreements only)
Signed and already-sent agreements keep their exact original text.

| Section | 2005 state sample | Version 2 |
|---|---|---|
| 1(a) Inspections | "At least at the frequency in Table V(b)" | Adds the permit's frequency, e.g. "not less than two (2) times per year, as required by the Operation Permit" |
| 1(c) Reports | Report to the county at the table's frequency | County and manufacturer within 30 days (18E .1304(c)) and the state data system (.1304(g)). Owner's copy by email once paid. Owner keeps the records. Nonpayment is cause for termination under 3(d), which may affect permit compliance. |
| 1(e) Repairs | Contractor makes repairs at the owner's request | Overwatch does not repair. A licensed contractor the owner selects and approves does the work. In an emergency, Overwatch may take temporary steps to make the system safe and notifies the owner within 24 hours. |
| 1(h) Operator | Not in the sample | Joshua Klein, NC Certified Subsurface Operator SS-1019571, or another operator with the required certification |
| 2(a) Price changes | Annual fee may change on 60 days' notice, capped yearly | Per-inspection fee may change on 60 days' written notice, capped at 10% a year |
| 9 Notice | Blank addresses | Contractor: 374 Hubert Herndon Rd, Chapel Hill, NC 27516. Health dept: name plus mailing address (Chatham: PO Box 130, 80 East St., Pittsboro, NC 27312). |

### Contract form
- New field: health department mailing address (fills in Chatham's).
- Contractor address fills in 374 Hubert Herndon Rd, Chapel Hill by default.

### Report delivery
- County copy: if payment is still pending 25 days after the visit, the daily job sends the county its copy and emails Josh. Keeps the 30-day rule.
- Owner's copy: waits for payment. Once payment clears, the owner gets the report in the email itself (uploaded PDF reports are attached). The county is not sent a second copy.

### Contract emails
- Josh gets a "[Copy] Agreement sent to ..." email each time an agreement is sent or resent. The signing link is left out of his copy.

## Proposed, not built yet
- 18E only for new contracts: remove the "Rules that apply" menu (or keep it as a hidden override). Signed 18A agreements keep their wording until renewed. Confirm with Brad Jones first: "Should all new O&M contracts cite 18E, even for systems first permitted under 18A?" Also ask him about witness/notary lines (item 6 below).

### Compared with the state's 2025 (18E) sample: Josh attached it Nov 1
The 2025 sample cites 18E only, with no 18A option, which supports the 18E-only change above. Gaps found:

1. **Owner's report timing (needs a decision).** The sample, and 18E .1304(c), say the report goes to the Owner, the manufacturer and the county. Version 2 holds the owner's copy until payment, so an unpaid owner could go past 30 days without a report. Proposed fix: on day 25 the daily job sends the owner's copy along with the county's, marked "payment still due". Payment is still enforced by late interest and termination for cause under 3(d).
2. **Repairs wording conflicts (fix).** Version 2's 1(e) says Overwatch does not repair, but 2(b) and 3(d) still say the owner shall "request the Contractor to complete needed repairs". Proposed: "provide the Contractor evidence that the needed repairs were completed by a licensed contractor", plus the same change in 3(d).
3. **Approval number (add).** The sample's maintenance clause cites the Operation Permit number, the Provisional or Innovative Approval number, and 18E Section .1300. Proposed: a new "Approval no." field, e.g. Perc-Rite IWWS-1993-01-R9A for Sean.
4. **Updated terms (18E contracts).** "On-site wastewater treatment and dispersal system" and "Wastewater Treatment and Dispersal Systems" replace the 2005 sample's "ground absorption sewage treatment system" and "Sanitary Sewage Collection, Treatment and Disposal".
5. **Health department contact name (optional).** The sample's Notice block asks for a contact name as well as an address.
6. **Witness/notary lines (ask).** The sample has a witness/notary line under each signature. The site uses e-signatures with no witness. Ask Brad whether Chatham expects it.
7. "Operator" vs "Contractor": no change needed. Same meaning.

The sample leaves fees, interest, the yearly increase cap, the per-inspection price and response hours blank or out, so version 2's additions there are allowed.

## Before relying on version 2
- Lawyer review of 1(c) (payment tie-in, and item 1 above), 1(e) (repair rewrite) and 2(a) (per-inspection pricing).

## Then, for Sean Wilkins
1. System setup: enter the permit issued date, Oct 19, 2026.
2. Customer record: set the system type to Vd.
3. Void the agreement already sent.
4. New contract: check "Rules that apply" shows 18E, $250 per inspection, 2 a year; send.
5. Reply to Sean's email (draft pending).
