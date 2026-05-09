# IT Department Attendance Management System

A modern and secure web-based attendance management system developed for the IT Department.
The platform provides dedicated portals for teachers and students, enabling seamless attendance tracking, reporting, and class management.

---

## 🚀 Features

### 👨‍🏫 Teacher Portal

* Manage multiple IT department classes
* Mark attendance using a simple **Present / Absent** interface
* Organize students using roll numbers
* Real-time attendance updates with instant visual feedback
* Generate:

  * Weekly Reports
  * Monthly Reports
  * Full-Term Reports
* Bulk actions:

  * Mark all students as Present
  * Mark all students as Absent
* Export reports as CSV
* Print attendance reports directly

---

### 👨‍🎓 Student Portal

* Personal attendance dashboard
* Attendance percentage tracking
* View attendance history
* Future-ready notification system

---

### ⚙️ Technical Highlights

* PostgreSQL database hosted on Neon Cloud
* Secure role-based authentication
* Responsive design for desktop, tablet, and mobile
* Dynamic UI updates without page refresh
* Secure password hashing with bcrypt
* Session-based authentication and security
* Cloud-based data storage

---

# 🛠️ Installation & Setup

## 1️⃣ Clone the Repository

```bash
git clone <repository-url>
cd attendance-system
```

---

## 2️⃣ Install Dependencies

```bash
npm install
```

---

## 3️⃣ Configure Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=your_postgresql_database_url
SESSION_SECRET=your_secret_key
PORT=3000
```

---

## 4️⃣ Start the Application

```bash
npm start
```

---

## 5️⃣ Open in Browser

```text
http://localhost:3000
```

---

# 🔐 Authentication

## Teacher Login

Teachers can securely log in to:

* Manage classes
* Take attendance
* Generate reports

## Student Login

Student authentication support is prepared and can be enabled through the admin interface.

---

# 🏫 System Structure

## Classes

| Class   | Department  | Students |
| ------- | ----------- | -------- |
| Class 1 | IT 3rd Year | 70       |
| Class 2 | IT 3rd Year | 65       |
| Class 3 | IT 3rd Year | 68       |

---

# 📝 Attendance Interface

Each student card contains:

* College Header
* Roll Number
* Student Name
* **P** button → Present
* **A** button → Absent

### Features

* Clean and responsive UI
* Instant attendance saving
* Live attendance progress tracking
* Color-based status indicators

---

# 📊 Reports & Analytics

Generate attendance reports for:

* Weekly attendance
* Monthly attendance
* Full-term attendance

### Included Statistics

* Total Present Days
* Total Absent Days
* Attendance Percentage
* Attendance Status Classification

| Percentage | Status    |
| ---------- | --------- |
| 90%+       | Excellent |
| 80%+       | Good      |
| 75%+       | Average   |
| Below 75%  | Poor      |

---

# 🗄️ Database Schema

## Users Table

Stores:

* Teacher accounts
* Student accounts
* Role-based authentication data

---

## Classes Table

Stores:

* Class information
* Assigned teachers
* Student counts

---

## Students Table

Stores:

* Student details
* Roll numbers
* Class assignments

---

## Attendance Table

Stores:

* Daily attendance records
* Present/Absent status
* Teacher information
* Timestamp details

---

# 📁 Project Structure

```bash
attendance-system/
│
├── server.js
├── package.json
├── .env
│
├── config/
│   ├── database.js
│   └── postgres.js
│
├── views/
│   ├── login.ejs
│   │
│   ├── teacher/
│   │   ├── dashboard.ejs
│   │   ├── attendance.ejs
│   │   └── reports.ejs
│   │
│   └── student/
│       └── dashboard.ejs
│
├── public/
│
└── README.md
```

---

# 📖 Usage Guide

## 👨‍🏫 For Teachers

### Login

Use teacher credentials to access the dashboard.

### Take Attendance

1. Open the teacher dashboard
2. Select a class
3. Click **Take Attendance**
4. Mark students as:

   * **P** → Present
   * **A** → Absent

### Generate Reports

* Open the Reports section
* Choose:

  * Weekly
  * Monthly
  * Full-Term
* Export or print reports

---

## 👨‍🎓 For Students

### Dashboard Access

Students can:

* View attendance percentage
* Monitor attendance history
* Track academic attendance performance

---

# 🔥 Core Features Explained

## Attendance Marking System

* Fast attendance selection
* Instant database updates
* Responsive design
* Bulk attendance actions

---

## Reporting System

* Automatic attendance calculations
* Exportable reports
* Performance categorization
* Printable attendance summaries

---

## Database Features

* Optimized queries
* Foreign key relationships
* Duplicate attendance prevention
* Preloaded sample data

---

# 🧰 Technologies Used

| Technology      | Purpose                |
| --------------- | ---------------------- |
| Node.js         | Backend Runtime        |
| Express.js      | Web Framework          |
| PostgreSQL      | Database               |
| Neon            | Cloud Database Hosting |
| EJS             | Templating Engine      |
| bcryptjs        | Password Hashing       |
| express-session | Session Management     |
| dotenv          | Environment Variables  |

---

# 🚧 Future Improvements

* Student self-registration
* Email notifications
* SMS alerts for low attendance
* Admin dashboard
* Subject-wise attendance tracking
* Analytics and charts
* Mobile application support

---

# 🤝 Contributing

Contributions are welcome.

## Steps

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to your branch
5. Open a Pull Request

---

# 📄 License

This project is licensed under the **ISC License**.

---

# 📞 Support

For technical support or feature requests, contact the IT Department administration.
