You can deploy your app publicly on a hosting provider.

Option 1: Render / Railway (Free)

Push the /server/ folder to GitHub.

Connect your GitHub repo to Render/Railway.

Add environment variables from .env.

The backend will be live (e.g., https://customer360.onrender.com).

Then, in /client/js/api.js, change:

const BASE_URL = "https://customer360.onrender.com";


Upload your client folder to Netlify, Vercel, or any static hosting site.

Option 2: VPS (Ubuntu / Nginx)
sudo apt update && sudo apt install nodejs npm nginx
git clone https://github.com/<your_repo>/customer360.git
cd customer360/server
npm install
npm run start


Then edit /etc/nginx/sites-available/default:

server {
  listen 80;
  server_name yourdomain.com;

  location / {
    root /var/www/customer360/client;
    index index.html;
  }

  location /api/ {
    proxy_pass http://localhost:4000/;
  }
}


Restart Nginx:

sudo systemctl restart nginx


Your site will be available at http://yourdomain.com

📦 API Endpoints Summary
Route	Method	Description
/api/auth/login	POST	Login
/api/employee/allocations	GET	Get customer allocations
/api/employee/feedback	POST	Submit feedback
/api/employee/feedback/:id	GET	Get feedback history
/api/employee/attendance	POST	Mark attendance
/api/ads/list	GET	List announcements/promos
👥 Roles
Admin:

Manage users, employees, allocations, and ads

Employee:

View allocations

Submit feedback (photo, GPS)

Mark attendance

View announcements

🧠 Notes

Works offline for UI testing (mock data)

Supports mobile camera & GPS (for proof capture)

CSV export ready in admin/employee dashboards

Secure backend APIs (JWT-based if configured later)

🧩 Author

Space Vortex Technologies
Developed for Customer 360 – Bank Collection Process Management
