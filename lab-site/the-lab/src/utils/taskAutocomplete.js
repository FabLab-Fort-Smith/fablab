"use client";

import { useState, useEffect, useRef } from "react";
import RepairTaskService from "@/services/repairTasks";

const TaskAutocomplete = ({ selectedTasks, setSelectedTasks, label = "Repair Tasks" }) => {
    const [repairTasks, setRepairTasks] = useState([]);
    const [taskSearch, setTaskSearch] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        RepairTaskService.fetchRepairTasks()
            .then(tasks => setRepairTasks(tasks))
            .catch(err => console.error("Error fetching repair tasks:", err));
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addTask = (task) => {
        if (!selectedTasks.find(t => t.title === task.title)) {
            setSelectedTasks([...selectedTasks, task]);
        }
        setTaskSearch("");
        setShowSuggestions(false);
    };

    const removeTask = (title) => {
        setSelectedTasks(selectedTasks.filter(t => t.title !== title));
    };

    const filteredSuggestions = repairTasks.filter(t =>
        t.title.toLowerCase().includes(taskSearch.toLowerCase()) &&
        !selectedTasks.find(s => s.title === t.title)
    );

    const labelStyle = { display: 'block', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6 };

    return (
        <div ref={containerRef}>
            <label style={labelStyle}>{label.toUpperCase()}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {selectedTasks.map(task => (
                    <span key={task.title} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {task.title}
                        <button type="button" onClick={() => removeTask(task.title)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: 0 }}>×</button>
                    </span>
                ))}
            </div>
            <div style={{ position: 'relative' }}>
                <input
                    className="input"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }}
                    placeholder="Start typing to search tasks..."
                    value={taskSearch}
                    onChange={e => { setTaskSearch(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                />
                {showSuggestions && taskSearch && filteredSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                        {filteredSuggestions.slice(0, 10).map(task => (
                            <button key={task.title} type="button" onMouseDown={() => addTask(task)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', borderBottom: '1px solid var(--bd)' }}>
                                {task.title}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TaskAutocomplete;
