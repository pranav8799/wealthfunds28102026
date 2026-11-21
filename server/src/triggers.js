// Triggers keep the NAME next to every user id (leads, calls, attendance, devices, shares, OTPs), so that in phpMyAdmin every row
// shows the executive's / admin's name and not only the numeric id. Never edit those *_name columns by hand.
module.exports = [
['trg_leads_exec_name_ins', `CREATE TRIGGER trg_leads_exec_name_ins BEFORE INSERT ON leads FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id),
      NEW.sold_by_name = (SELECT name FROM users WHERE id = NEW.sold_by)`],
['trg_leads_exec_name_upd', `CREATE TRIGGER trg_leads_exec_name_upd BEFORE UPDATE ON leads FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id),
      NEW.sold_by_name = (SELECT name FROM users WHERE id = NEW.sold_by)`],
['trg_calls_exec_name_ins', `CREATE TRIGGER trg_calls_exec_name_ins BEFORE INSERT ON calls FOR EACH ROW
  SET NEW.executive_name = (SELECT name FROM users WHERE id = NEW.executive_id)`],
['trg_attendance_name_ins', `CREATE TRIGGER trg_attendance_name_ins BEFORE INSERT ON attendance FOR EACH ROW
  SET NEW.user_name = (SELECT name FROM users WHERE id = NEW.user_id)`],
['trg_devices_name_ins', `CREATE TRIGGER trg_devices_name_ins BEFORE INSERT ON trusted_devices FOR EACH ROW
  SET NEW.user_name = (SELECT name FROM users WHERE id = NEW.user_id)`],
['trg_shares_name_ins', `CREATE TRIGGER trg_shares_name_ins BEFORE INSERT ON lead_shares FOR EACH ROW
  SET NEW.from_user_name = (SELECT name FROM users WHERE id = NEW.from_user_id),
      NEW.to_user_name = (SELECT name FROM users WHERE id = NEW.to_user_id)`],
['trg_otps_name_ins', `CREATE TRIGGER trg_otps_name_ins BEFORE INSERT ON login_otps FOR EACH ROW
  SET NEW.user_name = (SELECT name FROM users WHERE id = NEW.user_id),
      NEW.user_role = (SELECT role FROM users WHERE id = NEW.user_id),
      NEW.user_phone = (SELECT phone FROM users WHERE id = NEW.user_id)`],
['trg_users_name_upd', `CREATE TRIGGER trg_users_name_upd AFTER UPDATE ON users FOR EACH ROW
  BEGIN
    IF NEW.name <> OLD.name THEN
      UPDATE leads SET executive_name = NEW.name WHERE executive_id = NEW.id;
      UPDATE leads SET sold_by_name = NEW.name WHERE sold_by = NEW.id;
      UPDATE calls SET executive_name = NEW.name WHERE executive_id = NEW.id;
      UPDATE attendance SET user_name = NEW.name WHERE user_id = NEW.id;
      UPDATE trusted_devices SET user_name = NEW.name WHERE user_id = NEW.id;
      UPDATE lead_shares SET from_user_name = NEW.name WHERE from_user_id = NEW.id;
      UPDATE lead_shares SET to_user_name = NEW.name WHERE to_user_id = NEW.id;
      UPDATE login_otps SET user_name = NEW.name WHERE user_id = NEW.id;
    END IF;
    IF NEW.phone <> OLD.phone THEN
      UPDATE login_otps SET user_phone = NEW.phone WHERE user_id = NEW.id;
    END IF;
  END`],
];
