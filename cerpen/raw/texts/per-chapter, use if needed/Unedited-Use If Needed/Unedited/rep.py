import os
import csv
from docx import Document

def extract_story_info(file_path):
    """
    Extracts the first two non-empty lines (assumed to be Title and Author) 
    from a .docx file.
    """
    try:
        doc = Document(file_path)
        metadata = []
        
        # Iterate through paragraphs to find the first two non-empty lines
        for paragraph in doc.paragraphs:
            text = paragraph.text.strip()
            if text:  # Skip empty lines/whitespace
                metadata.append(text)
            if len(metadata) == 2:
                break
                
        # Handle cases where the document might be empty or missing lines
        title = metadata[0] if len(metadata) > 0 else "Unknown Title"
        author = metadata[1] if len(metadata) > 1 else "Unknown Author"
        
        return title, author

    except Exception as e:
        return f"Error reading file: {e}", ""

def process_stories_to_csv(root_folder, output_csv_filename):
    """
    Recursively walks through root_folder and subdirectories to find .docx files,
    extracts Title and Author, and saves the results to a CSV file.
    """
    # Define the CSV headers
    headers = ["File Name", "Folder Path", "Title", "Author"]
    results = []

    print(f"Scanning '{root_folder}' and its subdirectories...")

    # os.walk automatically digs into all subdirectories
    for dirpath, dirnames, filenames in os.walk(root_folder):
        for filename in filenames:
            # Look for .docx and skip Word temporary/lock files (which start with ~$)
            if filename.endswith(".docx") and not filename.startswith("~$"):
                file_path = os.path.join(dirpath, filename)
                
                # Extract details
                title, author = extract_story_info(file_path)
                
                # Store the data row
                results.append([filename, dirpath, title, author])

    # Write the results to the CSV file
    try:
        with open(output_csv_filename, mode='w', encoding='utf-8', newline='') as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(headers)  # Write header row
            writer.writerows(results)  # Write all data rows
            
        print(f"\nSuccess! Successfully processed {len(results)} files.")
        print(f"Results exported to: {os.path.abspath(output_csv_filename)}")
        
    except Exception as e:
        print(f"Error writing to CSV file: {e}")

# --- Execution ---
# Configure your paths here:
target_root_folder = "."      # '.' means the current folder where the script runs
csv_output_path = "stories_metadata.csv"

process_stories_to_csv(target_root_folder, csv_output_path)