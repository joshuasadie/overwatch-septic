# Pending changes (not yet live)

Last updated: November 1, 2026. Branch: `report-payment-flow` (built, tested, not merged).

## Built on the branch, waiting for Josh's OK

### Agreement version 3: the state's 18E sample (added Nov 1)
New contracts for systems permitted on or after Jan 1, 2024 use the state's 2025 "Sample Maintenance and Inspection Agreement" (15A NCAC 18E) word for word, using its terms ("Operator", "on-site wastewater treatment and dispersal system"). Blanks are filled in, and these additions are clearly marked:
- 1(b): not less than the inspection frequency on the Operation Permit (Sean's request 1)
- 1(c): Operation Permit number and Provisional/Innovative Approval number (from System setup)
- 1(d): reports within 30 days (.1304(c)) and to the state data system (.1304(g)). The owner's copy is emailed when paid or on day 25, whichever is earlier (request 3)
- 1(f): the owner picks who repairs. Overwatch may do repairs but doesn't have to, and they are billed. No repairs without the owner's approval. Emergency make-safe steps, with the owner told within 24 hours (request 6). 2(b) and 3(d)(2) match.
- 1(i): named operator and certificate number (request 4)
- 2(a): $250 per inspection × 2 = $500 a year. The per-inspection fee may change on 60 days' notice, by no more than 10% a year. Interest of 1.5% a month on late payments (request 7)
- 9: Operator address 374 Hubert Herndon Rd. Health department contact name, department and address (request 5)
- The signature block says "Operator"
Systems permitted before 2024 still get version 2 (the 18A text). Signed agreements are unchanged.

### Contract details come from the permit (added Nov 1)
New contracts take these from the permit in System setup: owner name(s), mailing address, property address(es) with the parcel number, county, system type, issue date and approval number. Anything left blank in System setup comes from the customer record.
Also added to version 3: either co-owner may give approvals (2(d)), there's no charge for county inspections (2(a)), and emergency make-safe steps are billed at $150 each (1(f)).

### Report delivery (updated Nov 1)
- Day 25, unpaid: the county copy and the owner's copy both go. The owner's copy says "payment still due" and includes the pay link. Josh gets an email. The portal copy unlocks once paid. When payment comes in, the owner is not emailed again.

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

### Report delivery (version 2 wording, now superseded by the update above)
- Paid before day 25: the owner gets the report by email (PDF attached for uploaded reports), and the county gets its copy.

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
- Lawyer review of 1(c) (payment tie-in, and item 1 above), 2(d) (co-owners jointly and severally responsible), 1(e) (repair rewrite) and 2(a) (per-inspection pricing).

## Then, for Sean Wilkins
1. System setup: enter the permit issued date, Oct 19, 2026.
2. Customer record: set the system type to Vd.
3. Void the agreement already sent.
4. New contract: check "Rules that apply" shows 18E, $250 per inspection, 2 a year; send.
5. Reply to Sean's email (draft pending).
