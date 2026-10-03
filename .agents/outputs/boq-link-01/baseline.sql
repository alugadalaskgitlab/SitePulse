-- Production read-only baseline; initial raw-site diagnostic retained below.
WITH valid AS (
 SELECT id, upper(regexp_replace(trim(regexp_replace(regexp_replace(site, '\s*[-–—:]\s*(Edited by|Copy by)\s+.*', '', 'i'), '\s+(Edited by|Copy by)\s+.*', '', 'i')), '\s+', ' ', 'g')) AS site,boq_project_id FROM dprs
 WHERE dpr_status='submitted' AND NOT COALESCE(is_deleted,false)
 AND NOT COALESCE(is_cancelled,false) AND NOT COALESCE(is_superseded,false)
), seg AS (
 SELECT s.equipment_log_id, count(DISTINCT s.id) AS segments,
 count(b.id) AS links,
 COALESCE(sum(s.hours_worked) FILTER (WHERE b.boq_item_id IS NOT NULL AND s.hours_worked>0),0) AS slice_hours
 FROM equipment_activity_segments s LEFT JOIN equipment_activity_segment_boq_items b ON b.segment_id=s.id GROUP BY s.equipment_log_id
), alloc AS (
 SELECT equipment_log_id,count(*) AS links,
 COALESCE(sum(hours_worked) FILTER (WHERE hours_worked>0),0) AS hours
 FROM equipment_activity_allocations GROUP BY equipment_log_id
), eq AS (
 SELECT v.site,e.id,e.hours_worked,
 CASE WHEN COALESCE(s.segments,0)>0 THEN CASE WHEN s.links>0 THEN 'segment' ELSE 'none' END
 WHEN COALESCE(a.links,0)>0 THEN 'allocation'
 WHEN e.boq_item_id IS NOT NULL THEN 'parent' ELSE 'none' END AS path,
 CASE WHEN COALESCE(s.segments,0)>0 THEN s.slice_hours
 WHEN COALESCE(a.links,0)>0 THEN a.hours
 WHEN e.boq_item_id IS NOT NULL AND e.hours_worked>0 THEN e.hours_worked ELSE 0 END AS attributed
 FROM valid v JOIN equipment_logs e ON e.dpr_id=v.id
 LEFT JOIN seg s ON s.equipment_log_id=e.id LEFT JOIN alloc a ON a.equipment_log_id=e.id
), progress AS (
 SELECT v.id,v.site,v.boq_project_id,count(DISTINCT p.boq_item_id) AS items
 FROM valid v LEFT JOIN progress_entries p ON p.dpr_id=v.id GROUP BY v.id,v.site,v.boq_project_id
)
SELECT json_build_object(
 'equipment',(SELECT json_agg(x) FROM (SELECT site,count(*) AS total,
 count(*) FILTER(WHERE path='segment') AS segment,
 count(*) FILTER(WHERE path='allocation') AS allocation,
 count(*) FILTER(WHERE path='parent') AS parent,
 count(*) FILTER(WHERE path='none') AS none,
 sum(COALESCE(hours_worked,0)) AS stored_hours,sum(attributed) AS attributed_hours,
 sum(GREATEST(COALESCE(hours_worked,0)-attributed,0)) AS unattributed_hours,
 count(*) FILTER(WHERE hours_worked IS NULL) AS missing_hours,
 count(*) FILTER(WHERE attributed>COALESCE(hours_worked,0)) AS attribution_exceeds_stored
 FROM eq GROUP BY site ORDER BY site) x),
 'labour',(SELECT json_agg(x) FROM (SELECT v.site,count(*) AS total,
 count(*) FILTER(WHERE l.boq_item_id IS NOT NULL) AS linked,count(*) FILTER(WHERE l.boq_item_id IS NULL) AS unlinked,
 COALESCE(sum(l.count) FILTER(WHERE l.boq_item_id IS NOT NULL),0) AS linked_headcount,
 COALESCE(sum(l.count) FILTER(WHERE l.boq_item_id IS NULL),0) AS unlinked_headcount
 FROM valid v JOIN labour_logs l ON l.dpr_id=v.id GROUP BY v.site ORDER BY v.site) x),
 'materials',(SELECT json_agg(x) FROM (SELECT v.site,m.type,count(*) AS total,
 count(*) FILTER(WHERE m.boq_item_id IS NOT NULL) AS linked,count(*) FILTER(WHERE m.boq_item_id IS NULL) AS unlinked
 FROM valid v JOIN material_logs m ON m.dpr_id=v.id GROUP BY v.site,m.type ORDER BY v.site,m.type) x),
 'dprs',(SELECT json_agg(x) FROM (SELECT site,count(*) AS total,
 count(*) FILTER(WHERE items=1) AS one_item,count(*) FILTER(WHERE items>=2) AS multiple_items,
 count(*) FILTER(WHERE items=0) AS no_items,
 count(*) FILTER(WHERE boq_project_id IS NULL AND items>0) AS null_project_with_links
 FROM progress GROUP BY site ORDER BY site) x)
) AS baseline;

-- Clock-time audit: segments counted once per machine, not once per BOQ.
WITH valid AS (
 SELECT id, upper(regexp_replace(trim(regexp_replace(regexp_replace(site, '\s*[-–—:]\s*(Edited by|Copy by)\s+.*', '', 'i'), '\s+(Edited by|Copy by)\s+.*', '', 'i')), '\s+', ' ', 'g')) AS site,boq_project_id FROM dprs
 WHERE dpr_status='submitted' AND NOT COALESCE(is_deleted,false)
 AND NOT COALESCE(is_cancelled,false) AND NOT COALESCE(is_superseded,false)
), row_hours AS (
 SELECT v.site,e.id,e.hours_worked,
 CASE WHEN e.start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 AND e.end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 AND e.end_time>e.start_time THEN round((extract(epoch FROM (e.end_time::time-e.start_time::time))/3600)::numeric,6) END AS clock_hours,
 CASE WHEN EXISTS(SELECT 1 FROM equipment_activity_segments s WHERE s.equipment_log_id=e.id)
 THEN COALESCE((SELECT sum(s.hours_worked) FROM equipment_activity_segments s WHERE s.equipment_log_id=e.id AND s.hours_worked>0 AND EXISTS(SELECT 1 FROM equipment_activity_segment_boq_items b WHERE b.segment_id=s.id)),0)
 WHEN EXISTS(SELECT 1 FROM equipment_activity_allocations a WHERE a.equipment_log_id=e.id)
 THEN COALESCE((SELECT sum(a.hours_worked) FROM equipment_activity_allocations a WHERE a.equipment_log_id=e.id AND a.hours_worked>0),0)
 WHEN e.boq_item_id IS NOT NULL AND e.hours_worked>0 THEN e.hours_worked ELSE 0 END AS assigned_once
 FROM valid v JOIN equipment_logs e ON e.dpr_id=v.id
)
SELECT site,count(*) AS rows,
 round(sum(clock_hours),3) AS known_clock_hours,
 count(*) FILTER(WHERE clock_hours IS NULL) AS missing_clock_rows,
 round(sum(assigned_once)::numeric,3) AS assigned_once_hours,
 round(sum(GREATEST(clock_hours-assigned_once,0)) FILTER(WHERE clock_hours IS NOT NULL)::numeric,3) AS known_clock_unassigned,
 count(*) FILTER(WHERE assigned_once>clock_hours+0.00001) AS assigned_exceeds_clock
 FROM row_hours GROUP BY site ORDER BY site;