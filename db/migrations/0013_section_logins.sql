-- A login belongs to one section, and each branch signs in from its own link.
--
-- Until now a kitchen login saw every section of kind KITCHEN at its branch.
-- That was fine while a branch had one kitchen. The Gastrobar and the Espresso
-- Bar now work three -- Restaurant, Hot Kitchen and Pastry Kitchen -- each with
-- its own shelf and its own people, and a pastry chef asking for flour must not
-- be able to log wastage against the hot kitchen.
--
-- So a kitchen or cleaning login names the one section it works in, and the
-- API narrows everything it sees to that section. Roles that run the branch
-- (management, storekeeper, admin) stand at no single shelf and leave it null.
-- A kitchen login that is still null keeps the old behaviour -- every section
-- of its kind -- so nothing breaks before an admin gets round to placing them.
--
-- Only the Gastrobar and the Espresso Bar are trading on this system. The other
-- three branches are switched off, not deleted: their rows stay so anything
-- filed against them stays readable, and setup can turn them back on.

begin;

alter table users add column section_id int references sections(id);
create index on users (section_id);

-- The two branches that sign in by link. Matched on code, not id, so this does
-- the right thing on a database whose ids were handed out differently.
--
-- The existing KITCHEN section becomes the Hot Kitchen rather than a new one
-- being added beside it: its stock and its history are the hot kitchen's.
update sections
   set name = 'Hot Kitchen'
 where kind = 'KITCHEN'
   and code = 'KITCHEN'
   and location_id in (select id from locations where code in ('GB', 'ESP'));

insert into sections (location_id, code, name, kind, is_store, is_active, is_demo)
select l.id, s.code, s.name, 'KITCHEN', false, true, l.is_demo
  from locations l
 cross join (values ('RESTAURANT', 'Restaurant'), ('PASTRY', 'Pastry Kitchen')) as s(code, name)
 where l.code in ('GB', 'ESP')
on conflict (location_id, code) do nothing;

-- Place the kitchen and cleaning logins that already exist. A kitchen login
-- goes to the hot kitchen, since that is the section it has been working in.
update users u
   set section_id = (
        select s.id from sections s
         where s.location_id = u.location_id
           and s.kind = case u.role when 'kitchen' then 'KITCHEN' else 'CLEAN' end
         order by (s.code = 'KITCHEN') desc, s.id
         limit 1)
 where u.role in ('kitchen', 'cleaning')
   and u.location_id is not null;

update locations set is_active = false where code in ('TCL', 'KAT', 'BANQ');

commit;
