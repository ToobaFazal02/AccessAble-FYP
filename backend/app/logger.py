import os
from datetime import datetime

# 1. Setup Log Directory
# Ye code automatically 'logs' folder dhoond kar wahan file banayega
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True) # Agar folder nahi hai to bana do

# Log File Name (Aaj ki date ke sath)
LOG_FILE = os.path.join(LOG_DIR, f"accessable_{datetime.now().strftime('%Y-%m-%d')}.log")

class LogColor:
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def write_to_file(level, message):
    """Logs ko file mein append karta hai"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = f"[{timestamp}] [{level}] {message}\n"
    
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        print(f"Log File Error: {e}")

def log_info(message: str):
    print(f"{LogColor.BLUE}[INFO]{LogColor.ENDC} {message}")
    write_to_file("INFO", message)

def log_success(message: str):
    print(f"{LogColor.GREEN}[SUCCESS]{LogColor.ENDC} {message}")
    write_to_file("SUCCESS", message)

def log_warning(message: str):
    print(f"{LogColor.WARNING}[WARNING]{LogColor.ENDC} {message}")
    write_to_file("WARNING", message)

def log_error(message: str):
    print(f"{LogColor.FAIL}[ERROR]{LogColor.ENDC} {message}")
    write_to_file("ERROR", message)