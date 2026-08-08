export const getVideoId = (url: string) => {
  const queryParams = url.trim().substring(url.indexOf("v="));
  const extraParams = queryParams.indexOf("&");
  const end = extraParams === -1 ? undefined : extraParams;
  const newUrl = queryParams.substring(2, end);
  return newUrl;
};
