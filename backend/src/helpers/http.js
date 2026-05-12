export const ok = (res, data, message = "OK") => {
  return res.status(200).json({ success: true, message, data });
};

export const created = (res, data, message = "Created") => {
  return res.status(201).json({ success: true, message, data });
};

export const fail = (res, status, message, details = null) => {
  return res.status(status).json({
    success: false,
    message,
    details,
  });
};

