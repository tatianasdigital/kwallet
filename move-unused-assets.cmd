@echo off
rem Moves image files the site no longer uses out of public\ into _unused-assets\
rem (nothing is deleted: check the folder, then delete it yourself if all is fine).
rem After this, run "npm run build" so dist\ is rebuilt without them.
cd /d "%~dp0"
if not exist _unused-assets mkdir _unused-assets
if not exist _unused-assets\about mkdir _unused-assets\about
for %%F in (step-01.png step-02.png step-03.png step-04.png step-05.png step-05-photo.webp demo-video-poster.png demo-video-poster.jpg avatar.png device-benefits-photo.png pricing-device.png flat-fish.png feature-eink.png feature-firmware.png feature-firmware-mask.png feature-nfc.png feature-nfc-mask.png feature-strongbox.png feature-transparent.png avatar-1.png avatar-2.png avatar-3.png press-saturn.png press-p2.png press-p3.png press-illustration.png about-planet.png binary-wave-flat-alpha.png cold-pressed-signing.svg flat-bg-artwork.svg star-cluster-flat.svg star-grey-flat.svg testimonial-arrow-prev.svg testimonial-arrow-next.svg fishgroup1-a.svg fishgroup1-b.svg fishgroup1-c.svg fishgroup1-d.svg fishgroup2.svg fishgroup3-a.svg fishgroup3-b.svg fishgroup3-c.svg fishgroup4.svg) do (
  if exist "public\assets\%%F" move /y "public\assets\%%F" "_unused-assets\%%F" >nul
)
for %%F in (planet.png gallery-5.jpg) do (
  if exist "public\assets\about\%%F" move /y "public\assets\about\%%F" "_unused-assets\about\%%F" >nul
)
echo Done: unused images moved to _unused-assets
pause
