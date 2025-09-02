# IT Department Attendance Management System

A comprehensive web-based attendance management system designed for the IT Department with separate portals for teachers and students.

## Features

### Teacher Portal
- **Class Management**: Manage 3 classes in 3rd year IT department
- **Attendance Marking**: Simple P/A selection interface for each student
- **Roll Number Based**: Students organized by roll numbers (1-70 for Class 1)
- **Real-time Updates**: Instant attendance marking with visual feedback
- **Reporting System**: 
  - Weekly attendance reports
  - Monthly attendance reports  
  - Full term attendance calculations
- **Bulk Actions**: Mark all present/absent with single click
- **Export Features**: Download reports as CSV, print functionality

### Student Portal
- **Personal Dashboard**: View individual attendance records
- **Progress Tracking**: Monitor attendance percentages
- **Future Features**: Coming soon notifications, detailed history

### Technical Features
- **Database**: PostgreSQL (Neon Cloud Database) with proper schema
- **Authentication**: Secure login system with role-based access
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Real-time UI**: Dynamic updates without page refresh
- **Data Security**: Session management and secure password storage
- **Cloud Storage**: Data stored securely in Neon PostgreSQL cloud database

## Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd attendance-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Access the application**
   - Open your browser and go to: `http://localhost:3000`

## Default Login Credentials

### Teacher Account
- **Username**: `teacher1`
- **Password**: `password`
- **Role**: Teacher (Sir CR Reddey)

### Student Accounts
- Student login functionality is prepared but accounts need to be created through admin interface

## System Structure

### Classes
- **Class 1**: IT 3rd Year - Class 1 (70 students)
- **Class 2**: IT 3rd Year - Class 2 (65 students)  
- **Class 3**: IT 3rd Year - Class 3 (68 students)

### Attendance Interface
Each student card displays:
- College header: "sir cr reddey clg"
- Roll number: "no.1", "no.2", etc.
- Student name: "bob", "alice", etc.
- Two buttons: **P** (Present) and **A** (Absent)

### Reports & Statistics
- **Weekly Reports**: Last 7 days attendance
- **Monthly Reports**: Last 30 days attendance  
- **Full Term**: Complete attendance history
- **Calculations**: Automatic percentage calculations
- **Status Indicators**: Color-coded attendance status

## Database Schema

### Users Table
- Teachers and students with role-based authentication
- Secure password hashing with bcrypt

### Classes Table
- Class information with teacher assignments
- Student count tracking

### Students Table
- Student details with roll numbers
- Class assignments and relationships

### Attendance Table
- Daily attendance records
- Present/Absent status tracking
- Teacher who marked attendance
- Timestamp information

## File Structure
```
attendance-system/
├── server.js              # Main application server
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (DATABASE_URL)
├── config/
│   ├── database.js        # SQLite configuration (legacy)
│   └── postgres.js        # PostgreSQL configuration
├── views/
│   ├── login.ejs          # Login page
│   ├── teacher/           # Teacher portal views
│   │   ├── dashboard.ejs  # Teacher dashboard
│   │   ├── attendance.ejs # Attendance marking interface
│   │   └── reports.ejs    # Reports and statistics
│   └── student/           # Student portal views
│       └── dashboard.ejs  # Student dashboard
├── public/                # Static assets
└── README.md              # Documentation
```

## Usage Instructions

### For Teachers

1. **Login**: Use teacher credentials to access the system
2. **Dashboard**: View all assigned classes and statistics
3. **Take Attendance**: 
   - Click "Take Attendance" for any class
   - See all students with roll numbers and names
   - Click P (Present) or A (Absent) for each student
   - Use bulk actions to mark all students at once
4. **View Reports**:
   - Click "View Reports" for detailed statistics
   - Switch between Weekly, Monthly, and Full term views
   - Export data or print reports

### For Students

1. **Login**: Use student credentials (to be implemented)
2. **Dashboard**: View personal attendance summary
3. **Reports**: Check attendance percentages and history

## Features in Detail

### Attendance Marking Interface
- **Visual Design**: Matches the UI mockup with red header and clean layout
- **Student Cards**: Each student gets their own card with clear identification
- **Interactive Buttons**: P/A buttons change color when selected
- **Real-time Updates**: Attendance saved immediately to database
- **Progress Tracking**: Live count of marked vs pending students

### Reporting System
- **Multiple Time Periods**: Week, Month, Full term analysis
- **Detailed Statistics**: Present days, absent days, percentages
- **Status Categories**: Excellent (90%+), Good (80%+), Average (75%+), Poor (<75%)
- **Export Options**: CSV download and print functionality

### Database Features
- **Data Integrity**: Foreign key relationships and constraints
- **Unique Constraints**: Prevent duplicate attendance entries
- **Efficient Queries**: Optimized for reporting and statistics
- **Sample Data**: Pre-loaded with 70 students for Class 1

## Development

### Adding New Features
1. Database changes in `config/database.js`
2. Backend routes in `server.js`
3. Frontend views in `views/` directory
4. Styling within EJS templates

### Dependencies
- **Express.js**: Web framework
- **PostgreSQL (pg)**: Cloud database via Neon
- **EJS**: Templating engine
- **bcryptjs**: Password hashing
- **express-session**: Session management
- **dotenv**: Environment variable management

## Support
For technical support or feature requests, contact the IT Department administration.

## License
ISC License - Internal use for IT Department
