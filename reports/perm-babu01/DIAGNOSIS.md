# Part A — established before application edits

The no-site reproduction returns 403 “Access denied for this site” for role
save, single link, arrangement options, preview and bulk. Selecting site 16
alone makes all five requests return 200. All-sites alone also works.
Setup incomplete defeats both grants; completing setup restores access.

There is also a genuine ordinary-user UI defect: the single-link editor reads
`/api/boq/projects/:id/earthwork-arrangements/item/:itemId`, guarded by
work_programme/work_programme_review View, although its save is guarded by
site_materials Edit. It converts failed reads to an empty list, hiding the
arrangement selector. The signed-in ordinary editor reproduced this with
site_materials View/Edit and site 16 access; role save and direct single-link
API succeeded. Administrators bypass the unrelated read guard.

Fix only that mismatch by using the existing site-scoped, Edit-guarded Material
Trips arrangement-options endpoint for manual trip correction, filtered to the
selected project/item. Do not weaken the Work Programme routes or grant extra
permissions. Allocation reads are unnecessary in manual mode.

The permissions row is “Site Materials Received”; it does not mention Material
Trips. Site Access is a separate accordion in Permissions, with explicit
all-sites and a no-sites warning. The needed setting is already findable.

The development record matching Babu already has View/Edit and site 16 access,
setup complete, and is not an Administrator. It therefore does not match the
reported current Administrator state. No production or historical account
state was inspected; the exact historical failure on his device is unproven.
No real account has been changed.

Further signed-in evidence also shows `/api/vendor-master` returning 403 on
master_parties View. This blocks the vendor/another-transporter branch despite
site_materials Edit. Own-source/own-vehicle saves already worked. A separate
trip-only identity picker (id, name, active state) will retain site_materials
Edit and the existing site-scope guard; the sensitive master endpoint and its
guard stay unchanged. No vendor details or master-management access are granted.
