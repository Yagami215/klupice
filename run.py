import uvicorn
import os
import sys

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("==================================================")
    print("       Klupice Online - Karta klupica Hrvatske    ")
    print("==================================================")
    print("Pokretanje web poslužitelja na: http://localhost:8000")
    print("Pritisnite Ctrl+C za zaustavljanje.")
    print("==================================================")
    
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
